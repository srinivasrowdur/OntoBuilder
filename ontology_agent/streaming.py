from __future__ import annotations

import json
import queue
import threading
import time
from collections.abc import Iterator
from typing import Any

from ontology_agent.agent import build_ontology_agent
from ontology_agent.config import AgentConfig, load_config
from ontology_agent.schema import OntologyRequest
from ontology_agent.service import apply_base_iri, parse_freeform_request, response_to_draft
from ontology_agent.skills import plan_ontology_skills


HEARTBEAT_SECONDS = 10.0

SKILL_LABELS = {
    "ontology-scope-control": "Scoping the domain",
    "ontology-domain-discovery": "Discovering domain concepts",
    "ontology-concept-gathering": "Gathering concepts",
    "ontology-relationship-design": "Designing relationships",
    "ontology-rule-design": "Designing rules",
    "ontology-statement-rendering": "Rendering statements",
    "ontology-consistency-validation": "Checking consistency",
    "ontology-json-export": "Preparing export",
}


def skill_label(skill_name: str) -> str:
    if skill_name in SKILL_LABELS:
        return SKILL_LABELS[skill_name]
    return skill_name.replace("-", " ").replace("_", " ").strip().capitalize() or skill_name


class OutlineStreamParser:
    """Incrementally extract draft items from streamed outline text.

    The live-stream agent writes one item per line (ENTITY: / RELATIONSHIP: /
    RULE: ...). Each completed line becomes a progress event the moment it
    arrives; lines that do not match the grammar are ignored, so a model that
    drifts into prose degrades gracefully instead of failing.
    """

    def __init__(self) -> None:
        self._buffer = ""
        self._seen_entities: set[str] = set()
        self.relationship_count = 0
        self.rule_count = 0

    def feed(self, delta: str) -> list[dict[str, Any]]:
        self._buffer += delta
        events: list[dict[str, Any]] = []
        while "\n" in self._buffer:
            line, self._buffer = self._buffer.split("\n", 1)
            event = self._parse_line(line.strip())
            if event is not None:
                events.append(event)
        return events

    def flush(self) -> list[dict[str, Any]]:
        line, self._buffer = self._buffer.strip(), ""
        event = self._parse_line(line)
        return [event] if event is not None else []

    def _parse_line(self, line: str) -> dict[str, Any] | None:
        if line.startswith("ENTITY:"):
            parts = [part.strip() for part in line[len("ENTITY:") :].split("|")]
            label = parts[0] if parts else ""
            if not label or label.lower() in self._seen_entities:
                return None
            self._seen_entities.add(label.lower())
            return {
                "type": "entity",
                "label": label,
                "entity_type": parts[1] if len(parts) > 1 and parts[1] else None,
            }
        if line.startswith("RELATIONSHIP:"):
            self.relationship_count += 1
            return self._counts_event()
        if line.startswith("RULE:"):
            self.rule_count += 1
            return self._counts_event()
        return None

    def _counts_event(self) -> dict[str, Any]:
        return {
            "type": "counts",
            "entities": len(self._seen_entities),
            "relationships": self.relationship_count,
            "rules": self.rule_count,
        }


def map_agno_event(event: Any, state: dict[str, Any]) -> dict[str, Any] | None:
    """Map one Agno run event to a draft-stream progress event, updating state."""
    name = getattr(event, "event", "")

    if name == "RunStarted":
        return {"type": "stage", "stage": "starting", "message": "Reading the request"}

    if name == "ToolCallStarted":
        tool = getattr(event, "tool", None)
        tool_name = getattr(tool, "tool_name", "") if tool else ""
        tool_args = getattr(tool, "tool_args", None) or {}
        if tool_name == "get_skill_instructions":
            name_arg = str(tool_args.get("skill_name", ""))
            return {"type": "skill", "skill": name_arg, "label": skill_label(name_arg)}
        if tool_name in {"search_project_knowledge", "search_existing_contract_ontology"}:
            return {"type": "stage", "stage": "research", "message": "Searching local knowledge"}
        return None

    if name == "ModelRequestStarted":
        state["model_requests"] = state.get("model_requests", 0) + 1
        if state["model_requests"] == 2:
            return {
                "type": "stage",
                "stage": "drafting",
                "message": "Drafting entities, relationships, and rules",
            }
        return None

    if name in {"RunContent", "RunCompleted"}:
        content = getattr(event, "content", None)
        if content is not None:
            state["content"] = content
        if name == "RunCompleted":
            state["completed"] = True
        return None

    if name == "RunError":
        state["error"] = getattr(event, "content", None) or "Ontology generation failed."
        return None

    return None


def stream_draft_events(
    prompt: str,
    *,
    scope: str | None = None,
    jurisdiction: str | None = None,
    user_id: str | None = None,
    session_id: str | None = None,
    config: AgentConfig | None = None,
) -> Iterator[dict[str, Any]]:
    """Yield progress events while generating an ontology draft.

    The final event is either {"type": "draft", "draft": <payload>} or
    {"type": "error", "message": <text>}. Heartbeats are emitted during
    long model silences so SSE connections stay alive.
    """
    config = config or load_config()
    parsed_request = parse_freeform_request(prompt)
    domain = parsed_request["domain"]
    resolved_scope = scope or parsed_request["scope"]

    yield {
        "type": "stage",
        "stage": "planning",
        "message": f"Planning the skill pipeline for {domain}",
    }
    skill_plan = json.loads(plan_ontology_skills(domain, resolved_scope, config.skills_dir))
    request = OntologyRequest(
        domain=domain,
        scope=resolved_scope,
        jurisdiction=jurisdiction,
        request_text=prompt,
        skill_sequence=skill_plan["skill_sequence"],
        extension_skills=skill_plan["extension_skills"],
    )

    events: queue.Queue[tuple[str, Any]] = queue.Queue()

    def run_agent() -> None:
        try:
            agent = build_ontology_agent(config, draft_mode=True, live_stream=True)
            for agno_event in agent.run(
                input=request,
                stream=True,
                stream_events=True,
                user_id=user_id or config.user_id,
                session_id=session_id or config.session_id,
            ):
                events.put(("event", agno_event))
            events.put(("done", None))
        except Exception as exc:  # pragma: no cover - depends on provider runtime
            events.put(("error", exc))

    worker = threading.Thread(target=run_agent, name="ontology-draft-stream", daemon=True)
    worker.start()

    started = time.monotonic()
    state: dict[str, Any] = {}
    outline = OutlineStreamParser()
    while True:
        try:
            kind, payload = events.get(timeout=HEARTBEAT_SECONDS)
        except queue.Empty:
            yield {"type": "heartbeat", "elapsed": round(time.monotonic() - started, 1)}
            continue
        if kind == "error":
            yield {"type": "error", "message": str(payload)}
            return
        if kind == "done":
            yield from outline.flush()
            break

        event_name = getattr(payload, "event", "")
        if event_name == "RunContent":
            content = getattr(payload, "content", None)
            if isinstance(content, str) and content:
                state["text"] = state.get("text", "") + content
                yield from outline.feed(content)
                continue
        if event_name == "ParserModelResponseStarted":
            yield {"type": "stage", "stage": "structuring", "message": "Structuring the draft"}
            continue

        mapped = map_agno_event(payload, state)
        if mapped is not None:
            yield mapped

    if state.get("error"):
        yield {"type": "error", "message": str(state["error"])}
        return
    final_content = state.get("content") or state.get("text")
    if not final_content:
        yield {"type": "error", "message": "The agent returned no draft content."}
        return

    yield {"type": "stage", "stage": "validating", "message": "Validating and repairing the draft"}
    try:
        draft = apply_base_iri(response_to_draft(final_content), config)
    except Exception as exc:
        yield {"type": "error", "message": f"Draft validation failed: {exc}"}
        return

    yield {
        "type": "draft",
        "draft": draft.model_dump(mode="json"),
        "domain": domain,
        "scope": resolved_scope,
    }
