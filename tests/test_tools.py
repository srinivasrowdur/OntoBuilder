import json

from ontology_agent.config import ROOT
from ontology_agent.repair import repair_ontology_draft_payload
from ontology_agent.schema import OntologyDraft
from ontology_agent.service import parse_freeform_request
from ontology_agent.skills import build_skill_context, plan_ontology_skills
from ontology_agent.tools import make_identifier, validate_ontology_draft_json


def test_make_identifier_normalizes_labels():
    assert make_identifier("Pension Scheme") == "pension_scheme"
    assert make_identifier("401(k) Plan") == "n_401_k_plan"


def test_parse_freeform_request_extracts_domain_and_scope():
    parsed = parse_freeform_request(
        "Build an ontology for insurance claims focused on policy administration"
    )

    assert parsed == {
        "domain": "insurance claims",
        "scope": "policy administration",
    }


def test_validate_ontology_draft_json_reports_invalid_json():
    result = validate_ontology_draft_json('{"domain": "x"}')
    assert '"valid": false' in result


def test_skill_plan_keeps_domain_and_adds_scope_overlay():
    result_text = plan_ontology_skills(
        "retirements",
        "Contract Management",
        ROOT / "ontology_agent" / "skills",
    )
    result = json.loads(result_text)

    assert "ontology-scope-control" in result["skill_sequence"]
    assert "retirement-ontology" in result["extension_skills"]
    assert "contract-management-ontology" in result["extension_skills"]
    assert result["extension_skills"].index("retirement-ontology") < result[
        "extension_skills"
    ].index("contract-management-ontology")
    assert "domain is primary" in result["principle"]


def test_skill_plan_uses_skill_metadata_without_domain_code():
    result = json.loads(
        plan_ontology_skills(
            "insurance",
            "policy administration",
            ROOT / "ontology_agent" / "skills",
        )
    )

    assert result["extension_skills"] == []
    assert result["skill_sequence"][0] == "ontology-scope-control"


def test_repair_adds_missing_statements():
    payload = json.loads((ROOT / "examples" / "retirements-ontology-draft.json").read_text())
    payload["statements"] = payload["statements"][:1]

    repaired = repair_ontology_draft_payload(payload)

    assert isinstance(repaired, OntologyDraft)
    relationship_ids = {relationship.id for relationship in repaired.relationships}
    rule_ids = {rule.id for rule in repaired.rules}
    statement_relationship_ids = {
        statement.relationship_id
        for statement in repaired.statements
        if statement.kind == "relationship"
    }
    statement_rule_ids = {
        statement.rule_id for statement in repaired.statements if statement.kind == "rule"
    }
    assert relationship_ids <= statement_relationship_ids
    assert rule_ids <= statement_rule_ids


def test_repair_normalizes_string_null_links():
    payload = json.loads((ROOT / "examples" / "retirements-ontology-draft.json").read_text())
    for statement in payload["statements"]:
        if statement["kind"] == "rule":
            statement["object_entity_id"] = "null"
            statement["relationship_id"] = "null"
            break

    repaired = repair_ontology_draft_payload(payload)

    assert isinstance(repaired, OntologyDraft)


def test_repair_drops_unknown_statement_relationships():
    payload = json.loads((ROOT / "examples" / "retirements-ontology-draft.json").read_text())
    payload["statements"].append(
        {
            "id": "statement_unknown_relationship",
            "kind": "relationship",
            "text": "A Control satisfies a Compliance Requirement.",
            "subject_entity_id": "member",
            "predicate": "satisfies",
            "object_entity_id": "pension_scheme",
            "relationship_id": "control_satisfies_compliance",
            "rule_id": None,
        }
    )

    repaired = repair_ontology_draft_payload(payload)

    assert isinstance(repaired, OntologyDraft)
    assert all(
        statement.relationship_id != "control_satisfies_compliance"
        for statement in repaired.statements
    )


def test_repair_drops_unknown_competency_question_relationships():
    payload = json.loads((ROOT / "examples" / "retirements-ontology-draft.json").read_text())
    payload["competency_questions"][0]["expected_relationships"].append(
        "control_satisfies_compliance"
    )

    repaired = repair_ontology_draft_payload(payload)

    assert isinstance(repaired, OntologyDraft)
    assert (
        "control_satisfies_compliance"
        not in repaired.competency_questions[0].expected_relationships
    )


def test_skill_context_loads_planned_skills_in_order():
    context = build_skill_context(
        "retirements",
        "Contract Management",
        ROOT / "ontology_agent" / "skills",
    )

    assert context.index("# retirement-ontology") < context.index("# contract-management-ontology")
    assert context.index("# retirement-ontology") < context.index("# ontology-concept-gathering")
    assert "The domain is primary" in context
