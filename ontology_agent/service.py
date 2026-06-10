from __future__ import annotations

from contextlib import redirect_stderr, redirect_stdout
from dataclasses import dataclass
import io
import json
import re
from typing import Any

from ontology_agent.agent import build_ontology_agent
from ontology_agent.config import AgentConfig, load_config
from ontology_agent.repair import repair_ontology_draft_payload
from ontology_agent.schema import OntologyDraft, OntologyRequest
from ontology_agent.skills import plan_ontology_skills


@dataclass(frozen=True)
class OntologyRunResult:
    draft: OntologyDraft
    logs: str
    domain: str
    scope: str | None


def build_draft_from_prompt(
    prompt: str,
    *,
    scope: str | None = None,
    jurisdiction: str | None = None,
    user_id: str | None = None,
    session_id: str | None = None,
    config: AgentConfig | None = None,
) -> OntologyRunResult:
    config = config or load_config()
    parsed_request = parse_freeform_request(prompt)
    domain = parsed_request["domain"]
    resolved_scope = scope or parsed_request["scope"]
    skill_plan = json.loads(plan_ontology_skills(domain, resolved_scope, config.skills_dir))
    runtime_logs = io.StringIO()
    request = OntologyRequest(
        domain=domain,
        scope=resolved_scope,
        jurisdiction=jurisdiction,
        request_text=prompt,
        skill_sequence=skill_plan["skill_sequence"],
        extension_skills=skill_plan["extension_skills"],
    )

    with redirect_stdout(runtime_logs), redirect_stderr(runtime_logs):
        agent = build_ontology_agent(config, draft_mode=True)
        response = agent.run(
            input=request,
            user_id=user_id or config.user_id,
            session_id=session_id or config.session_id,
        )

    return OntologyRunResult(
        draft=response_to_draft(response.content),
        logs=runtime_logs.getvalue(),
        domain=domain,
        scope=resolved_scope,
    )


def parse_freeform_request(request: str) -> dict[str, str | None]:
    text = " ".join(request.strip().split())
    scope = None

    scope_markers = [
        " scoped to ",
        " with scope ",
        " focusing on ",
        " focused on ",
        " around ",
    ]
    for marker in scope_markers:
        if marker in text.lower():
            index = text.lower().index(marker)
            scope = text[index + len(marker) :].strip(" .")
            text = text[:index].strip(" .")
            break

    domain = text
    patterns = [
        r"(?i)^.*?\b(?:ontology|model)\s+(?:for|about|of)\s+(.+)$",
        r"(?i)^.*?\b(?:for|about|of)\s+(.+)$",
    ]
    for pattern in patterns:
        match = re.match(pattern, text)
        if match:
            domain = match.group(1).strip(" .")
            break

    return {"domain": domain, "scope": scope}


def response_to_draft(content: Any) -> OntologyDraft:
    if isinstance(content, OntologyDraft):
        return content
    if hasattr(content, "model_dump"):
        payload = content.model_dump(mode="json")
        try:
            return OntologyDraft.model_validate(payload)
        except Exception:
            return repair_ontology_draft_payload(payload)
    if isinstance(content, str):
        try:
            return OntologyDraft.model_validate_json(content)
        except Exception:
            return repair_ontology_draft_payload(content)
    if isinstance(content, dict):
        try:
            return OntologyDraft.model_validate(content)
        except Exception:
            return repair_ontology_draft_payload(content)
    raise TypeError(f"Unsupported response content type: {type(content)!r}")
