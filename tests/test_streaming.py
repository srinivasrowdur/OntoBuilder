import json
from types import SimpleNamespace

from fastapi.testclient import TestClient

from ontology_agent.api import create_app
from ontology_agent.config import ROOT
from ontology_agent.review import ReviewStore
from ontology_agent.schema import OntologyDraft
from ontology_agent.streaming import map_agno_event, skill_label


def _tool_event(tool_name: str, tool_args: dict | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        event="ToolCallStarted",
        tool=SimpleNamespace(tool_name=tool_name, tool_args=tool_args or {}),
    )


def test_skill_label_known_and_fallback() -> None:
    assert skill_label("ontology-rule-design") == "Designing rules"
    assert skill_label("retirement-ontology") == "Retirement ontology"


def test_map_skill_load_to_skill_event() -> None:
    event = _tool_event("get_skill_instructions", {"skill_name": "ontology-concept-gathering"})
    mapped = map_agno_event(event, {})
    assert mapped == {
        "type": "skill",
        "skill": "ontology-concept-gathering",
        "label": "Gathering concepts",
    }


def test_map_second_model_request_to_drafting_stage() -> None:
    state: dict = {}
    first = map_agno_event(SimpleNamespace(event="ModelRequestStarted"), state)
    second = map_agno_event(SimpleNamespace(event="ModelRequestStarted"), state)
    assert first is None
    assert second is not None
    assert second["stage"] == "drafting"


def test_map_run_completed_captures_content() -> None:
    state: dict = {}
    mapped = map_agno_event(SimpleNamespace(event="RunCompleted", content={"domain": "x"}), state)
    assert mapped is None
    assert state["content"] == {"domain": "x"}
    assert state["completed"] is True


def test_map_unknown_event_is_ignored() -> None:
    assert map_agno_event(SimpleNamespace(event="CompressionStarted"), {}) is None


def _parse_sse(body: str) -> list[dict]:
    events = []
    for block in body.split("\n\n"):
        block = block.strip()
        if block.startswith("data: "):
            events.append(json.loads(block[len("data: ") :]))
    return events


def test_stream_endpoint_emits_progress_and_creates_session(tmp_path) -> None:
    draft = OntologyDraft.model_validate_json(
        (ROOT / "examples" / "retirements-ontology-draft.json").read_text()
    )

    def fake_stream(prompt, **_kwargs):
        yield {"type": "stage", "stage": "planning", "message": "Planning"}
        yield {"type": "skill", "skill": "ontology-rule-design", "label": "Designing rules"}
        yield {"type": "draft", "draft": draft.model_dump(mode="json")}

    store = ReviewStore(tmp_path)
    client = TestClient(create_app(store=store, stream_draft=fake_stream))

    response = client.post(
        "/api/ontology/drafts/stream",
        json={"prompt": "Build an ontology for retirements"},
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")

    events = _parse_sse(response.text)
    types = [event["type"] for event in events]
    assert types == ["stage", "skill", "complete"]

    session_payload = events[-1]["session"]
    assert session_payload["draft"]["domain"] == draft.domain
    assert store.get(session_payload["id"]).draft.domain == draft.domain


def test_stream_endpoint_reports_stream_errors(tmp_path) -> None:
    def failing_stream(prompt, **_kwargs):
        yield {"type": "stage", "stage": "planning", "message": "Planning"}
        raise RuntimeError("provider exploded")

    client = TestClient(create_app(store=ReviewStore(tmp_path), stream_draft=failing_stream))
    response = client.post(
        "/api/ontology/drafts/stream",
        json={"prompt": "Build an ontology for retirements"},
    )
    events = _parse_sse(response.text)
    assert events[-1]["type"] == "error"
    assert "provider exploded" in events[-1]["message"]
