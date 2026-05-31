import json
from pathlib import Path

from ontology_agent.schema import (
    Entity,
    NaturalLanguageStatement,
    OntologyDraft,
    Relationship,
    Rule,
)


ROOT = Path(__file__).resolve().parents[1]


def test_retirement_draft_schema_accepts_statement_pattern():
    draft = OntologyDraft(
        domain="retirements",
        scope="workplace pension schemes",
        namespace_suggestion="https://example.com/ontology/retirements#",
        summary="Starter retirement ontology.",
        entities=[
            Entity(id="member", label="Member", description="A scheme participant."),
            Entity(
                id="pension_scheme",
                label="Pension Scheme",
                description="A retirement scheme.",
            ),
            Entity(
                id="contribution",
                label="Contribution",
                description="A payment into the scheme.",
            ),
        ],
        relationships=[
            Relationship(
                id="member_belongs_to_pension_scheme",
                subject_entity_id="member",
                predicate="belongs_to",
                label="belongs to",
                object_entity_id="pension_scheme",
                description="A member participates in a pension scheme.",
            )
        ],
        rules=[
            Rule(
                id="contribution_amount_positive",
                applies_to_entity_id="contribution",
                rule_type="value_constraint",
                predicate="amount",
                operator="gt",
                value=0,
                value_datatype="xsd:decimal",
                text="A Contribution must have an amount greater than 0.",
                rationale="A non-positive contribution is not a valid payment into a scheme.",
            )
        ],
        statements=[
            NaturalLanguageStatement(
                id="statement_member_belongs_to_pension_scheme",
                kind="relationship",
                text="A Member belongs to a Pension Scheme.",
                subject_entity_id="member",
                predicate="belongs to",
                object_entity_id="pension_scheme",
                relationship_id="member_belongs_to_pension_scheme",
            ),
            NaturalLanguageStatement(
                id="statement_contribution_amount_positive",
                kind="rule",
                text="A Contribution must have an amount greater than 0.",
                subject_entity_id="contribution",
                predicate="must have amount greater than",
                rule_id="contribution_amount_positive",
            ),
        ],
    )

    assert draft.statements[0].relationship_id == "member_belongs_to_pension_scheme"
    assert draft.rules[0].operator == "gt"


def test_schema_rejects_unknown_relationship_entity():
    try:
        OntologyDraft(
            domain="x",
            namespace_suggestion="https://example.com/ontology/x#",
            summary="Invalid draft.",
            entities=[Entity(id="member", label="Member", description="A member.")],
            relationships=[
                Relationship(
                    id="bad",
                    subject_entity_id="member",
                    predicate="belongs_to",
                    label="belongs to",
                    object_entity_id="missing_scheme",
                    description="Invalid relation.",
                )
            ],
        )
    except ValueError as exc:
        assert "Unknown relationship object" in str(exc)
    else:
        raise AssertionError("Expected schema validation to reject unknown entity")


def test_schema_rejects_missing_relationship_statement():
    try:
        OntologyDraft(
            domain="retirements",
            namespace_suggestion="https://example.com/ontology/retirements#",
            summary="Invalid draft.",
            entities=[
                Entity(id="member", label="Member", description="A scheme participant."),
                Entity(
                    id="pension_scheme",
                    label="Pension Scheme",
                    description="A retirement scheme.",
                ),
            ],
            relationships=[
                Relationship(
                    id="member_belongs_to_pension_scheme",
                    subject_entity_id="member",
                    predicate="belongs_to",
                    label="belongs to",
                    object_entity_id="pension_scheme",
                    description="A member participates in a pension scheme.",
                )
            ],
        )
    except ValueError as exc:
        assert "Missing natural-language statements for relationships" in str(exc)
    else:
        raise AssertionError("Expected schema validation to reject missing statements")


def test_schema_rejects_mismatched_relationship_statement():
    try:
        OntologyDraft(
            domain="retirements",
            namespace_suggestion="https://example.com/ontology/retirements#",
            summary="Invalid draft.",
            entities=[
                Entity(id="member", label="Member", description="A scheme participant."),
                Entity(
                    id="pension_scheme",
                    label="Pension Scheme",
                    description="A retirement scheme.",
                ),
            ],
            relationships=[
                Relationship(
                    id="member_belongs_to_pension_scheme",
                    subject_entity_id="member",
                    predicate="belongs_to",
                    label="belongs to",
                    object_entity_id="pension_scheme",
                    description="A member participates in a pension scheme.",
                )
            ],
            statements=[
                NaturalLanguageStatement(
                    id="bad_statement",
                    kind="relationship",
                    text="A Pension Scheme belongs to a Member.",
                    subject_entity_id="pension_scheme",
                    predicate="belongs to",
                    object_entity_id="member",
                    relationship_id="member_belongs_to_pension_scheme",
                )
            ],
        )
    except ValueError as exc:
        assert "subject does not match relationship" in str(exc)
    else:
        raise AssertionError("Expected schema validation to reject mismatched statements")


def test_retirement_example_fixture_is_valid():
    payload = json.loads((ROOT / "examples" / "retirements-ontology-draft.json").read_text())
    draft = OntologyDraft.model_validate(payload)

    assert draft.domain == "retirements"
    assert any(
        statement.text == "A Member belongs to a Pension Scheme." for statement in draft.statements
    )
