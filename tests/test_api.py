import json

from fastapi.testclient import TestClient

from ontology_agent.api import create_app
from ontology_agent.config import ROOT
from ontology_agent.projects import ProjectStore
from ontology_agent.review import EntityReferenceRequest, ReviewStore, StatementCreateRequest
from ontology_agent.schema import Cardinality, OntologyDraft
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


def test_api_creates_relationship_and_rule_statements(tmp_path):
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

    relationship_response = client.post(
        f"/api/ontology/drafts/{session['id']}/statements",
        json={
            "kind": "relationship",
            "subject": {"id": "member"},
            "predicate_label": "owns",
            "object": {"label": "Retirement Account", "entity_type": "class"},
            "relationship_type": "financial",
        },
    )

    assert relationship_response.status_code == 200
    relationship_session = relationship_response.json()
    assert len(relationship_session["draft"]["entities"]) == len(draft.entities) + 1
    assert relationship_session["statements"][-1]["status"] == "pending"
    assert relationship_session["statements"][-1]["statement"]["text"] == (
        "A Member owns a Retirement Account."
    )

    rule_response = client.post(
        f"/api/ontology/drafts/{session['id']}/statements",
        json={
            "kind": "rule",
            "applies_to": {"id": "contribution"},
            "rule_type": "value_constraint",
            "severity": "must",
            "predicate_label": "vesting age",
            "operator": "gte",
            "value": 55,
            "value_datatype": "xsd:integer",
        },
    )

    assert rule_response.status_code == 200
    rule_session = rule_response.json()
    assert rule_session["statements"][-1]["statement"]["kind"] == "rule"
    assert rule_session["statements"][-1]["statement"]["text"] == (
        "A Contribution must have a vesting age greater than or equal to 55."
    )
    assert len(rule_session["draft"]["rules"]) == len(draft.rules) + 1


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


def test_api_creates_project_and_saves_single_ontology_folder(tmp_path):
    review_path = tmp_path / "reviews"
    project_path = tmp_path / "projects"
    client = TestClient(
        create_app(
            store=ReviewStore(review_path),
            project_store=ProjectStore(project_path),
        )
    )

    project_response = client.post(
        "/api/projects",
        json={
            "name": "Vanguard Advisory",
            "description": "Distribution partner reporting knowledge base.",
        },
    )
    assert project_response.status_code == 200
    project = project_response.json()
    assert project["slug"] == "vanguard-advisory"

    session = client.post("/api/ontology/drafts/samples/retirements").json()
    save_response = client.post(
        f"/api/projects/{project['id']}/save",
        json={"draft_id": session["id"]},
    )

    assert save_response.status_code == 200
    saved = save_response.json()
    saved_project = saved["project"]
    assert saved_project["domain"] == "retirements"
    assert saved_project["statement_count"] == 8
    saved_path = project_path / "vanguard-advisory"
    assert (saved_path / "project.md").exists()
    assert (saved_path / "ontology.md").exists()
    assert (saved_path / "ontology.json").exists()
    assert (saved_path / "review-session.json").exists()
    assert (saved_path / "statements.md").exists()
    assert (saved_path / "entities" / "member.md").exists()
    assert "# retirements" in (saved_path / "ontology.md").read_text()
    assert "A Member belongs to a Pension Scheme." in (saved_path / "statements.md").read_text()

    projects_response = client.get("/api/projects")
    assert projects_response.status_code == 200
    assert projects_response.json()[0]["draft_id"] == session["id"]

    open_response = client.get(f"/api/projects/{project['id']}/session")
    assert open_response.status_code == 200
    assert open_response.json()["id"] == session["id"]


def test_api_revises_saved_project_with_entity_mentions(tmp_path):
    review_path = tmp_path / "reviews"
    project_path = tmp_path / "projects"
    client = TestClient(
        create_app(
            store=ReviewStore(review_path),
            project_store=ProjectStore(project_path),
        )
    )

    project = client.post("/api/projects", json={"name": "Retirement Ops"}).json()
    session = client.post("/api/ontology/drafts/samples/retirements").json()
    client.post(f"/api/projects/{project['id']}/save", json={"draft_id": session["id"]})

    relationship_response = client.post(
        f"/api/projects/{project['id']}/revise",
        json={
            "draft_id": session["id"],
            "instruction": "@Member owns one or more @Account",
            "mentions": [
                {"id": "member", "label": "Member", "token": "@Member"},
                {"id": "account", "label": "Account", "token": "@Account"},
            ],
        },
    )

    assert relationship_response.status_code == 200
    relationship_result = relationship_response.json()
    assert relationship_result["intent"] == "add_relationship"
    relationship_session = relationship_result["session"]
    added_relationship = relationship_session["draft"]["relationships"][-1]
    assert added_relationship["label"] == "owns"
    assert added_relationship["cardinality"]["text"] == "one or more"
    assert relationship_session["statements"][-1]["statement"]["text"] == (
        "A Member owns one or more Accounts."
    )
    assert relationship_result["project"]["statement_count"] == 9

    rule_response = client.post(
        f"/api/projects/{project['id']}/revise",
        json={
            "draft_id": session["id"],
            "instruction": "@Member must have at least one @Beneficiary",
            "mentions": [
                {"id": "member", "label": "Member", "token": "@Member"},
                {"id": "beneficiary", "label": "Beneficiary", "token": "@Beneficiary"},
            ],
        },
    )

    assert rule_response.status_code == 200
    rule_result = rule_response.json()
    assert rule_result["intent"] == "add_rule"
    rule_session = rule_result["session"]
    added_rule = rule_session["draft"]["rules"][-1]
    assert added_rule["applies_to_entity_id"] == "member"
    assert added_rule["operator"] == "min_count"
    assert added_rule["value"] == 1
    assert added_rule["value_entity_id"] == "beneficiary"
    assert rule_session["statements"][-1]["statement"]["text"] == (
        "A Member must have at least one Beneficiary."
    )
    assert rule_result["project"]["statement_count"] == 10

    saved_path = project_path / "retirement-ops"
    assert "A Member owns one or more Accounts." in (saved_path / "statements.md").read_text()
    assert (
        "A Member must have at least one Beneficiary." in (saved_path / "statements.md").read_text()
    )


def test_api_revises_saved_project_with_entity_expansion_instruction(tmp_path):
    review_path = tmp_path / "reviews"
    project_path = tmp_path / "projects"
    captured_modes = []

    def fake_expand_entity(_session, entity, _instruction, mode):
        captured_modes.append(mode)
        return [
            StatementCreateRequest(
                kind="relationship",
                subject=EntityReferenceRequest(id=entity.id),
                predicate_label="has",
                object=EntityReferenceRequest(
                    label="Member Identifier",
                    entity_type="external_reference",
                    description="Stable identifier for a member.",
                ),
                relationship_type="association",
                cardinality=Cardinality(min_count=1, max_count=1, text="exactly one"),
            ),
            StatementCreateRequest(
                kind="relationship",
                subject=EntityReferenceRequest(id=entity.id),
                predicate_label="has",
                object=EntityReferenceRequest(
                    label="Member Status",
                    entity_type="state",
                    description="Lifecycle state for a member.",
                ),
                relationship_type="lifecycle",
                cardinality=Cardinality(min_count=1, max_count=1, text="exactly one"),
            ),
        ]

    client = TestClient(
        create_app(
            store=ReviewStore(review_path),
            project_store=ProjectStore(project_path),
            expand_entity=fake_expand_entity,
        )
    )

    project = client.post("/api/projects", json={"name": "Cricket Scoring"}).json()
    session = client.post("/api/ontology/drafts/samples/retirements").json()
    client.post(f"/api/projects/{project['id']}/save", json={"draft_id": session["id"]})

    response = client.post(
        f"/api/projects/{project['id']}/revise",
        json={
            "draft_id": session["id"],
            "instruction": "@Member Expand on this entity to cover more",
            "mentions": [{"id": "member", "label": "Member", "token": "@Member"}],
        },
    )

    assert response.status_code == 200
    result = response.json()
    assert result["intent"] == "expand_entity"
    assert result["message"] == "Added 2 ontology expansion statements for Member."
    assert captured_modes == ["ontology"]
    assert result["project"]["statement_count"] == 10
    expanded_session = result["session"]
    added_statements = expanded_session["statements"][-2:]
    assert {review["status"] for review in added_statements} == {"pending"}
    assert added_statements[0]["statement"]["text"] == (
        "A Member has exactly one Member Identifier."
    )
    assert added_statements[1]["statement"]["text"] == ("A Member has exactly one Member Status.")
    assert any(
        entity["label"] == "Member Identifier" for entity in expanded_session["draft"]["entities"]
    )

    saved_path = project_path / "cricket-scoring"
    assert (
        "A Member has exactly one Member Identifier." in (saved_path / "statements.md").read_text()
    )
    assert (saved_path / "entities" / "member-identifier.md").exists()


def test_api_routes_saved_project_rule_expansion_through_agent(tmp_path):
    review_path = tmp_path / "reviews"
    project_path = tmp_path / "projects"
    captured_modes = []

    def fake_expand_entity(_session, entity, _instruction, mode):
        captured_modes.append(mode)
        return [
            StatementCreateRequest(
                kind="rule",
                applies_to=EntityReferenceRequest(id=entity.id),
                rule_type="validation",
                severity="should",
                predicate_label="have a review status",
                operator="exists",
                statement_text="A Member should have a review status.",
            )
        ]

    client = TestClient(
        create_app(
            store=ReviewStore(review_path),
            project_store=ProjectStore(project_path),
            expand_entity=fake_expand_entity,
        )
    )

    project = client.post("/api/projects", json={"name": "Cricket Scoring"}).json()
    session = client.post("/api/ontology/drafts/samples/retirements").json()
    client.post(f"/api/projects/{project['id']}/save", json={"draft_id": session["id"]})

    response = client.post(
        f"/api/projects/{project['id']}/revise",
        json={
            "draft_id": session["id"],
            "instruction": "@Member expand rules for review quality",
            "mentions": [{"id": "member", "label": "Member", "token": "@Member"}],
        },
    )

    assert response.status_code == 200
    result = response.json()
    assert result["intent"] == "expand_entity"
    assert result["message"] == "Added 1 rule expansion statements for Member."
    assert captured_modes == ["rules"]
    assert result["session"]["statements"][-1]["statement"]["kind"] == "rule"
    assert result["session"]["statements"][-1]["statement"]["text"] == (
        "A Member should have a review status."
    )


def test_api_rejects_unknown_project_revision_mentions(tmp_path):
    review_path = tmp_path / "reviews"
    project_path = tmp_path / "projects"
    client = TestClient(
        create_app(
            store=ReviewStore(review_path),
            project_store=ProjectStore(project_path),
        )
    )

    project = client.post("/api/projects", json={"name": "Retirement Ops"}).json()
    session = client.post("/api/ontology/drafts/samples/retirements").json()
    client.post(f"/api/projects/{project['id']}/save", json={"draft_id": session["id"]})

    response = client.post(
        f"/api/projects/{project['id']}/revise",
        json={
            "draft_id": session["id"],
            "instruction": "@Unknown owns @Account",
            "mentions": [{"id": "unknown", "label": "Unknown", "token": "@Unknown"}],
        },
    )

    assert response.status_code == 400
    assert "Unknown entity mention id" in response.json()["detail"]
