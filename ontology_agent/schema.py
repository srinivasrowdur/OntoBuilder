from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


Identifier = Annotated[
    str,
    Field(
        pattern=r"^[a-z][a-z0-9_]*$",
        description="Stable snake_case identifier for JSON parsing and RDF/OWL mapping.",
    ),
]


class OntologyRequest(BaseModel):
    """Structured request passed to the ontology-building agent."""

    domain: str = Field(..., min_length=2, description="Domain to model, for example retirements.")
    scope: str | None = Field(
        None,
        description="Optional boundary for the model, such as UK workplace pensions.",
    )
    jurisdiction: str | None = Field(
        None,
        description="Optional jurisdiction if rules depend on law or regulation.",
    )
    request_text: str | None = Field(
        default=None,
        description="Original free-form user request when the ask command is used.",
    )
    audience: str = Field(
        default="knowledge engineers and product builders",
        description="Primary users of the ontology draft.",
    )
    max_entities: int = Field(default=30, ge=5, le=80)
    max_relationships: int = Field(default=45, ge=5, le=120)
    include_rules: bool = True
    include_competency_questions: bool = True
    skill_context: str | None = Field(
        default=None,
        description="System-provided loaded skill context for this request.",
    )


class Entity(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Identifier
    label: str = Field(..., min_length=1)
    entity_type: Literal[
        "class",
        "role",
        "document",
        "event",
        "process",
        "state",
        "attribute",
        "value",
        "external_reference",
    ] = "class"
    description: str = Field(..., min_length=1)
    aliases: list[str] = Field(default_factory=list)
    parent_entity_id: Identifier | None = None
    examples: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.7, ge=0, le=1)


class Cardinality(BaseModel):
    model_config = ConfigDict(extra="forbid")

    min_count: int | None = Field(default=None, ge=0)
    max_count: int | None = Field(default=None, ge=0)
    text: str | None = Field(
        default=None,
        description="Human-readable cardinality such as one or more, exactly one, or optional.",
    )

    @model_validator(mode="after")
    def validate_bounds(self) -> "Cardinality":
        if (
            self.min_count is not None
            and self.max_count is not None
            and self.max_count < self.min_count
        ):
            raise ValueError("max_count must be greater than or equal to min_count")
        return self


class Relationship(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Identifier
    subject_entity_id: Identifier
    predicate: Identifier = Field(description="Machine-friendly relationship name.")
    label: str = Field(description="Human-readable relationship phrase.")
    object_entity_id: Identifier
    relationship_type: Literal[
        "association",
        "composition",
        "classification",
        "participation",
        "financial",
        "temporal",
        "governance",
        "lifecycle",
        "eligibility",
    ] = "association"
    cardinality: Cardinality | None = None
    inverse_label: str | None = None
    description: str = Field(..., min_length=1)
    confidence: float = Field(default=0.7, ge=0, le=1)


class Rule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Identifier
    applies_to_entity_id: Identifier
    rule_type: Literal[
        "cardinality",
        "value_constraint",
        "eligibility",
        "temporal",
        "calculation",
        "compliance",
        "lifecycle",
        "validation",
    ]
    severity: Literal["must", "should", "may"] = "must"
    predicate: Identifier = Field(description="Property or relationship being constrained.")
    operator: Literal[
        "exists",
        "eq",
        "neq",
        "gt",
        "gte",
        "lt",
        "lte",
        "in",
        "not_in",
        "min_count",
        "max_count",
        "pattern",
    ]
    value: str | int | float | bool | list[str] | None = None
    value_entity_id: Identifier | None = None
    value_datatype: str | None = Field(
        default=None,
        description="Suggested datatype such as xsd:decimal, xsd:dateTime, or iri.",
    )
    text: str = Field(..., min_length=1)
    rationale: str = Field(..., min_length=1)
    implementation_hint: str | None = Field(
        default=None,
        description="Optional OWL, SHACL, database, or application validation hint.",
    )
    confidence: float = Field(default=0.7, ge=0, le=1)


class NaturalLanguageStatement(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Identifier
    kind: Literal["relationship", "rule"]
    text: str = Field(
        ...,
        description="Readable statement such as 'A Member belongs to a Pension Scheme.'",
    )
    subject_entity_id: Identifier
    predicate: str
    object_entity_id: Identifier | None = None
    relationship_id: Identifier | None = None
    rule_id: Identifier | None = None

    @model_validator(mode="after")
    def validate_statement_link(self) -> "NaturalLanguageStatement":
        if self.kind == "relationship" and not self.relationship_id:
            raise ValueError("relationship statements must include relationship_id")
        if self.kind == "rule" and not self.rule_id:
            raise ValueError("rule statements must include rule_id")
        return self


class CompetencyQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Identifier
    question: str
    expected_entities: list[Identifier] = Field(default_factory=list)
    expected_relationships: list[Identifier] = Field(default_factory=list)


class OntologyDraft(BaseModel):
    """Canonical JSON output for generated ontology drafts."""

    model_config = ConfigDict(extra="forbid")

    domain: str
    scope: str | None = None
    namespace_suggestion: str = Field(
        ...,
        description="Suggested namespace base, for example https://example.com/ontology/retirements#.",
    )
    summary: str = Field(..., min_length=1)
    entities: list[Entity] = Field(default_factory=list)
    relationships: list[Relationship] = Field(default_factory=list)
    rules: list[Rule] = Field(default_factory=list)
    statements: list[NaturalLanguageStatement] = Field(default_factory=list)
    competency_questions: list[CompetencyQuestion] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    open_questions: list[str] = Field(default_factory=list)
    extension_points: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_references(self) -> "OntologyDraft":
        entity_ids = {entity.id for entity in self.entities}
        relationship_ids = {relationship.id for relationship in self.relationships}
        rule_ids = {rule.id for rule in self.rules}
        relationships_by_id = {relationship.id: relationship for relationship in self.relationships}
        rules_by_id = {rule.id: rule for rule in self.rules}

        for entity in self.entities:
            if entity.parent_entity_id and entity.parent_entity_id not in entity_ids:
                raise ValueError(f"Unknown parent_entity_id: {entity.parent_entity_id}")

        for relationship in self.relationships:
            if relationship.subject_entity_id not in entity_ids:
                raise ValueError(f"Unknown relationship subject: {relationship.subject_entity_id}")
            if relationship.object_entity_id not in entity_ids:
                raise ValueError(f"Unknown relationship object: {relationship.object_entity_id}")

        for rule in self.rules:
            if rule.applies_to_entity_id not in entity_ids:
                raise ValueError(f"Unknown rule target: {rule.applies_to_entity_id}")
            if rule.value_entity_id and rule.value_entity_id not in entity_ids:
                raise ValueError(f"Unknown rule value entity: {rule.value_entity_id}")

        for statement in self.statements:
            if statement.subject_entity_id not in entity_ids:
                raise ValueError(f"Unknown statement subject: {statement.subject_entity_id}")
            if statement.object_entity_id and statement.object_entity_id not in entity_ids:
                raise ValueError(f"Unknown statement object: {statement.object_entity_id}")
            if (
                statement.kind == "relationship"
                and statement.relationship_id not in relationship_ids
            ):
                raise ValueError(f"Unknown statement relationship: {statement.relationship_id}")
            if statement.kind == "rule" and statement.rule_id not in rule_ids:
                raise ValueError(f"Unknown statement rule: {statement.rule_id}")
            if statement.kind == "relationship" and statement.relationship_id:
                relationship = relationships_by_id[statement.relationship_id]
                if statement.subject_entity_id != relationship.subject_entity_id:
                    raise ValueError(
                        f"Statement {statement.id} subject does not match relationship "
                        f"{relationship.id}"
                    )
                if statement.object_entity_id != relationship.object_entity_id:
                    raise ValueError(
                        f"Statement {statement.id} object does not match relationship "
                        f"{relationship.id}"
                    )
            if statement.kind == "rule" and statement.rule_id:
                rule = rules_by_id[statement.rule_id]
                if statement.subject_entity_id != rule.applies_to_entity_id:
                    raise ValueError(
                        f"Statement {statement.id} subject does not match rule {rule.id}"
                    )

        for question in self.competency_questions:
            for entity_id in question.expected_entities:
                if entity_id not in entity_ids:
                    raise ValueError(f"Unknown competency question entity: {entity_id}")
            for relationship_id in question.expected_relationships:
                if relationship_id not in relationship_ids:
                    raise ValueError(f"Unknown competency question relationship: {relationship_id}")

        relationship_statement_ids = {
            statement.relationship_id
            for statement in self.statements
            if statement.kind == "relationship" and statement.relationship_id
        }
        missing_relationship_statements = relationship_ids - relationship_statement_ids
        if missing_relationship_statements:
            missing = ", ".join(sorted(missing_relationship_statements))
            raise ValueError(f"Missing natural-language statements for relationships: {missing}")

        rule_statement_ids = {
            statement.rule_id
            for statement in self.statements
            if statement.kind == "rule" and statement.rule_id
        }
        missing_rule_statements = rule_ids - rule_statement_ids
        if missing_rule_statements:
            missing = ", ".join(sorted(missing_rule_statements))
            raise ValueError(f"Missing natural-language statements for rules: {missing}")

        return self
