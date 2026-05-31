import json

from fastapi.testclient import TestClient

from ontology_agent.api import create_app
from ontology_agent.config import ROOT
from ontology_agent.review import ReviewStore
from ontology_agent.schema import OntologyDraft
from ontology_agent.service import OntologyRunResult


def test_api_review_and_commit_flow(tmp_path):
    draft = OntologyDraft.model_validate_json(
        (ROOT / "examples" / "retirements-ontology-draft.json").read_text()
    )

    def fake_build(prompt, **_kwargs):
        return OntologyRunResult(draft=draft, logs="", domain=draft.domain, scope=draft.scope)

    client = TestClient(
        create_app(
            store=ReviewStore(tmp_path),
            build_draft=fake_build,
        )
    )

    health_response = client.get("/api/health")
    assert health_response.status_code == 200
    assert health_response.json()["status"] == "ok"

    create_response = client.post(
        "/api/ontology/drafts",
        json={"prompt": "Build an ontology for retirements"},
    )
    assert create_response.status_code == 200
    session = create_response.json()
    draft_id = session["id"]
    assert len(session["statements"]) == 8
    assert {review["status"] for review in session["statements"]} == {"pending"}
    assert session["statements"][0]["impact"]["entities"]
    assert session["statements"][0]["impact"]["relationships"]

    commit_without_acceptance = client.post(f"/api/ontology/drafts/{draft_id}/commit")
    assert commit_without_acceptance.status_code == 400

    relationship_statement_id = next(
        review["statement"]["id"]
        for review in session["statements"]
        if review["statement"]["kind"] == "relationship"
    )
    rule_statement_id = next(
        review["statement"]["id"]
        for review in session["statements"]
        if review["statement"]["kind"] == "rule"
    )

    accept_response = client.patch(
        f"/api/ontology/drafts/{draft_id}/statements/{relationship_statement_id}",
        json={"status": "accepted", "comment": "Relationship is correct."},
    )
    assert accept_response.status_code == 200
    assert accept_response.json()["status"] == "accepted"

    edit_response = client.patch(
        f"/api/ontology/drafts/{draft_id}/statements/{rule_statement_id}",
        json={
            "status": "edited",
            "text": "A Contribution must have a positive amount.",
            "comment": "Cleaner wording.",
        },
    )
    assert edit_response.status_code == 200
    assert edit_response.json()["statement"]["text"] == (
        "A Contribution must have a positive amount."
    )

    commit_response = client.post(f"/api/ontology/drafts/{draft_id}/commit")
    assert commit_response.status_code == 200
    committed = commit_response.json()
    assert committed["included_statement_ids"] == [
        relationship_statement_id,
        rule_statement_id,
    ]
    assert len(committed["ontology"]["statements"]) == 2
    assert len(committed["ontology"]["relationships"]) == 1
    assert len(committed["ontology"]["rules"]) == 1

    export_response = client.get(f"/api/ontology/drafts/{draft_id}/export?status=all")
    assert export_response.status_code == 200
    assert len(export_response.json()["statements"]) == len(draft.statements)


def test_api_bulk_accepts_selected_statements(tmp_path):
    draft = OntologyDraft.model_validate(
        json.loads((ROOT / "examples" / "retirements-ontology-draft.json").read_text())
    )

    def fake_build(prompt, **_kwargs):
        return OntologyRunResult(draft=draft, logs="", domain=draft.domain, scope=draft.scope)

    client = TestClient(create_app(store=ReviewStore(tmp_path), build_draft=fake_build))
    session = client.post(
        "/api/ontology/drafts",
        json={"prompt": "Build an ontology for retirements"},
    ).json()
    selected_statement_ids = [review["statement"]["id"] for review in session["statements"][:2]]

    response = client.post(
        f"/api/ontology/drafts/{session['id']}/statements/review",
        json={
            "status": "accepted",
            "statement_ids": selected_statement_ids,
            "comment": "Approved in bulk.",
        },
    )

    assert response.status_code == 200
    statuses = {
        review["statement"]["id"]: review["status"] for review in response.json()["statements"]
    }
    assert [statuses[statement_id] for statement_id in selected_statement_ids] == [
        "accepted",
        "accepted",
    ]


def test_api_updates_entity_labels_for_review_and_commit(tmp_path):
    draft = OntologyDraft.model_validate_json(
        (ROOT / "examples" / "retirements-ontology-draft.json").read_text()
    )

    def fake_build(prompt, **_kwargs):
        return OntologyRunResult(draft=draft, logs="", domain=draft.domain, scope=draft.scope)

    client = TestClient(create_app(store=ReviewStore(tmp_path), build_draft=fake_build))
    session = client.post(
        "/api/ontology/drafts",
        json={"prompt": "Build an ontology for retirements"},
    ).json()

    rename_response = client.patch(
        f"/api/ontology/drafts/{session['id']}/entities/member",
        json={"label": "Plan Member"},
    )

    assert rename_response.status_code == 200
    renamed = rename_response.json()
    member = next(entity for entity in renamed["draft"]["entities"] if entity["id"] == "member")
    assert member["label"] == "Plan Member"
    assert renamed["statements"][0]["statement"]["text"] == (
        "A Plan Member belongs to a Pension Scheme."
    )
    assert renamed["statements"][0]["impact"]["entities"][0]["label"] == "Plan Member"

    client.post(
        f"/api/ontology/drafts/{session['id']}/statements/review",
        json={"status": "accepted"},
    )
    commit_response = client.post(f"/api/ontology/drafts/{session['id']}/commit")

    assert commit_response.status_code == 200
    committed = commit_response.json()["ontology"]
    assert any(
        entity["id"] == "member" and entity["label"] == "Plan Member"
        for entity in committed["entities"]
    )
    assert committed["statements"][0]["text"] == "A Plan Member belongs to a Pension Scheme."


def test_api_imports_existing_draft_for_review(tmp_path):
    draft = OntologyDraft.model_validate_json(
        (ROOT / "examples" / "retirements-ontology-draft.json").read_text()
    )
    client = TestClient(create_app(store=ReviewStore(tmp_path)))

    response = client.post(
        "/api/ontology/drafts/import",
        json={
            "draft": draft.model_dump(mode="json"),
            "source_prompt": "Sample retirement draft",
        },
    )

    assert response.status_code == 200
    session = response.json()
    assert session["draft"]["domain"] == "retirements"
    assert session["source_prompt"] == "Sample retirement draft"
    assert len(session["statements"]) == len(draft.statements)


def test_api_creates_sample_draft_for_frontend(tmp_path):
    client = TestClient(create_app(store=ReviewStore(tmp_path)))

    response = client.post("/api/ontology/drafts/samples/retirements")

    assert response.status_code == 200
    session = response.json()
    assert session["draft"]["domain"] == "retirements"
    assert session["source_prompt"] == "Sample retirements draft"
    assert len(session["statements"]) == 8
