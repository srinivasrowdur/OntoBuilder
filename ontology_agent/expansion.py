from __future__ import annotations

from contextlib import redirect_stderr, redirect_stdout
from dataclasses import dataclass
import inspect
import io
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from ontology_agent.agent import _validate_model_runtime
from ontology_agent.config import AgentConfig, load_config
from ontology_agent.review import (
    EntityReferenceRequest,
    EntityType,
    RelationshipType,
    RuleOperator,
    RuleType,
    StatementCreateRequest,
)
from ontology_agent.schema import Cardinality, Entity, Relationship, Rule
from ontology_agent.skills import load_skill_text
from ontology_agent.review import DraftReviewSession


ExpansionMode = Literal["ontology", "relationships", "rules"]


class EntitySnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    label: str
    entity_type: str
    description: str


class RelationshipSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject: str
    predicate_label: str
    object: str
    relationship_type: str
    cardinality: str | None = None


class RuleSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    applies_to: str
    severity: str
    predicate: str
    operator: str
    value: str | int | float | bool | list[str] | None = None


class EntityExpansionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    domain: str
    scope: str | None = None
    mode: ExpansionMode = "ontology"
    instruction: str = Field(..., min_length=1)
    target_entity: EntitySnapshot
    existing_entities: list[EntitySnapshot]
    existing_relationships: list[RelationshipSnapshot]
    existing_rules: list[RuleSnapshot]
    existing_statements: list[str]
    skill_context: str
    max_relationships: int = Field(default=8, ge=0, le=12)
    max_rules: int = Field(default=4, ge=0, le=8)


class ExpansionRelationshipCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    predicate_label: str = Field(..., min_length=1)
    object_label: str = Field(..., min_length=1)
    object_entity_type: EntityType = "class"
    object_description: str | None = None
    relationship_type: RelationshipType = "association"
    cardinality_min_count: int | None = Field(default=None, ge=0)
    cardinality_max_count: int | None = Field(default=None, ge=0)
    cardinality_text: str | None = None
    rationale: str | None = None


class ExpansionRuleCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    severity: Literal["must", "should", "may"] = "must"
    predicate_label: str = Field(..., min_length=1)
    rule_type: RuleType = "validation"
    operator: RuleOperator = "exists"
    value: str | int | float | bool | list[str] | None = None
    value_entity_label: str | None = None
    value_entity_type: EntityType = "class"
    value_entity_description: str | None = None
    statement_text: str | None = None
    rationale: str | None = None


class EntityExpansionPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str
    relationships: list[ExpansionRelationshipCandidate] = Field(default_factory=list)
    rules: list[ExpansionRuleCandidate] = Field(default_factory=list)


@dataclass(frozen=True)
class EntityExpansionRunResult:
    requests: list[StatementCreateRequest]
    plan: EntityExpansionPlan
    logs: str


def build_entity_expansion_requests(
    session: DraftReviewSession,
    entity: Entity,
    instruction: str,
    *,
    mode: ExpansionMode = "ontology",
    config: AgentConfig | None = None,
) -> list[StatementCreateRequest]:
    return build_entity_expansion(session, entity, instruction, mode=mode, config=config).requests


def build_entity_expansion(
    session: DraftReviewSession,
    entity: Entity,
    instruction: str,
    *,
    mode: ExpansionMode = "ontology",
    config: AgentConfig | None = None,
) -> EntityExpansionRunResult:
    config = config or load_config()
    request = _entity_expansion_request(session, entity, instruction, mode, config)
    runtime_logs = io.StringIO()

    with redirect_stdout(runtime_logs), redirect_stderr(runtime_logs):
        agent = _build_entity_expansion_agent(config)
        response = agent.run(
            input=request,
            user_id=config.user_id,
            session_id=f"{config.session_id}-entity-expansion",
            dependencies={"ontology_skill_context": request.skill_context},
            add_dependencies_to_context=True,
        )

    plan = _response_to_expansion_plan(response.content)
    return EntityExpansionRunResult(
        requests=_plan_to_statement_requests(session, entity, plan, mode),
        plan=plan,
        logs=runtime_logs.getvalue(),
    )


def _build_entity_expansion_agent(config: AgentConfig) -> Any:
    from agno.agent import Agent
    from agno.db.sqlite import SqliteDb

    agent_params = inspect.signature(Agent).parameters
    _validate_model_runtime(config.model)
    agent_kwargs: dict[str, Any] = {
        "name": "Ontology Entity Expansion",
        "id": "ontology-entity-expansion",
        "model": config.model,
        "db": SqliteDb(db_file=str(config.db_path)),
        "description": (
            "Expands an existing ontology around one target entity by proposing "
            "additional entities, relationships, rules, and statements."
        ),
        "instructions": [
            "You are an ontology entity-expansion specialist.",
            "Use the supplied current ontology as the boundary and source of truth.",
            "The user is not asking for prose notes. Propose new ontology candidates.",
            "Return only the structured output requested by the output schema.",
            "Honor request.mode exactly: relationships means relationship candidates only; rules means rule candidates only; ontology means both are allowed.",
            "Respect max_relationships and max_rules. Leave a candidate list empty when its max is zero.",
            "Prefer relationships and entities that add new useful coverage beyond existing statements.",
            "Do not duplicate an existing relationship or rule.",
            "Use existing entity labels when the concept already exists.",
            "Keep predicates short verb phrases such as has, includes, is classified by, is played at.",
            "Make cardinality explicit when it is obvious from the candidate statement.",
            "Add rules only when they are domain-relevant and reviewable.",
        ],
        "input_schema": EntityExpansionRequest,
        "output_schema": EntityExpansionPlan,
        "add_history_to_context": True,
        "num_history_runs": config.num_history_runs,
        "max_tool_calls_from_history": config.max_tool_calls_from_history,
        "markdown": False,
        "telemetry": config.telemetry,
        "debug_mode": config.debug,
    }
    return Agent(**{key: value for key, value in agent_kwargs.items() if key in agent_params})


def _entity_expansion_request(
    session: DraftReviewSession,
    entity: Entity,
    instruction: str,
    mode: ExpansionMode,
    config: AgentConfig,
) -> EntityExpansionRequest:
    entity_labels = {candidate.id: candidate.label for candidate in session.draft.entities}
    skill_context = "\n\n".join(
        [
            load_skill_text(config.skills_dir, "ontology-entity-expansion"),
            load_skill_text(config.skills_dir, "ontology-concept-gathering"),
            load_skill_text(config.skills_dir, "ontology-relationship-design"),
            load_skill_text(config.skills_dir, "ontology-rule-design"),
            load_skill_text(config.skills_dir, "ontology-statement-rendering"),
        ]
    )
    return EntityExpansionRequest(
        domain=session.draft.domain,
        scope=session.draft.scope,
        mode=mode,
        instruction=instruction,
        target_entity=_entity_snapshot(entity),
        existing_entities=[_entity_snapshot(candidate) for candidate in session.draft.entities],
        existing_relationships=[
            _relationship_snapshot(relationship, entity_labels)
            for relationship in session.draft.relationships
        ],
        existing_rules=[_rule_snapshot(rule, entity_labels) for rule in session.draft.rules],
        existing_statements=[review.statement.text for review in session.statements],
        skill_context=skill_context,
        max_relationships=0 if mode == "rules" else 8,
        max_rules=0 if mode == "relationships" else 4,
    )


def _plan_to_statement_requests(
    session: DraftReviewSession,
    entity: Entity,
    plan: EntityExpansionPlan,
    mode: ExpansionMode,
) -> list[StatementCreateRequest]:
    requests: list[StatementCreateRequest] = []
    known_relationships = _known_relationship_keys(session)
    known_rules = _known_rule_keys(session)

    if mode != "rules":
        for candidate in plan.relationships:
            key = (
                entity.label.lower(),
                candidate.predicate_label.lower(),
                candidate.object_label.lower(),
            )
            if key in known_relationships:
                continue
            try:
                requests.append(
                    StatementCreateRequest(
                        kind="relationship",
                        subject=EntityReferenceRequest(id=entity.id),
                        predicate_label=candidate.predicate_label,
                        object=EntityReferenceRequest(
                            label=candidate.object_label,
                            entity_type=candidate.object_entity_type,
                            description=(
                                candidate.object_description
                                or f"{candidate.object_label} added during entity expansion."
                            ),
                        ),
                        relationship_type=candidate.relationship_type,
                        cardinality=_candidate_cardinality(candidate),
                    )
                )
            except ValidationError:
                continue

    if mode != "relationships":
        for candidate in plan.rules:
            value_key = (
                candidate.value_entity_label.lower()
                if isinstance(candidate.value_entity_label, str)
                else str(candidate.value).lower()
                if candidate.value is not None
                else ""
            )
            key = (
                entity.label.lower(),
                candidate.severity.lower(),
                candidate.predicate_label.lower(),
                candidate.operator.lower(),
                value_key,
            )
            if key in known_rules:
                continue
            try:
                requests.append(
                    StatementCreateRequest(
                        kind="rule",
                        applies_to=EntityReferenceRequest(id=entity.id),
                        rule_type=candidate.rule_type,
                        severity=candidate.severity,
                        predicate_label=candidate.predicate_label,
                        operator=candidate.operator,
                        value=candidate.value,
                        value_entity=EntityReferenceRequest(
                            label=candidate.value_entity_label,
                            entity_type=candidate.value_entity_type,
                            description=(
                                candidate.value_entity_description
                                or f"{candidate.value_entity_label} added during entity expansion."
                            ),
                        )
                        if candidate.value_entity_label
                        else None,
                        statement_text=candidate.statement_text,
                    )
                )
            except ValidationError:
                continue

    return requests[:12]


def _known_relationship_keys(session: DraftReviewSession) -> set[tuple[str, str, str]]:
    entity_labels = {entity.id: entity.label.lower() for entity in session.draft.entities}
    return {
        (
            entity_labels.get(relationship.subject_entity_id, relationship.subject_entity_id),
            relationship.label.lower(),
            entity_labels.get(relationship.object_entity_id, relationship.object_entity_id),
        )
        for relationship in session.draft.relationships
    }


def _known_rule_keys(session: DraftReviewSession) -> set[tuple[str, str, str, str, str]]:
    entity_labels = {entity.id: entity.label.lower() for entity in session.draft.entities}
    keys: set[tuple[str, str, str, str, str]] = set()
    for rule in session.draft.rules:
        value_key = ""
        if rule.value_entity_id:
            value_key = entity_labels.get(rule.value_entity_id, rule.value_entity_id).lower()
        elif rule.value is not None:
            value_key = str(rule.value).lower()
        keys.add(
            (
                entity_labels.get(rule.applies_to_entity_id, rule.applies_to_entity_id),
                rule.severity.lower(),
                rule.predicate.lower(),
                rule.operator.lower(),
                value_key,
            )
        )
    return keys


def _candidate_cardinality(
    candidate: ExpansionRelationshipCandidate,
) -> Cardinality | None:
    if (
        candidate.cardinality_min_count is None
        and candidate.cardinality_max_count is None
        and not candidate.cardinality_text
    ):
        return None
    return Cardinality(
        min_count=candidate.cardinality_min_count,
        max_count=candidate.cardinality_max_count,
        text=candidate.cardinality_text,
    )


def _entity_snapshot(entity: Entity) -> EntitySnapshot:
    return EntitySnapshot(
        id=entity.id,
        label=entity.label,
        entity_type=entity.entity_type,
        description=entity.description,
    )


def _relationship_snapshot(
    relationship: Relationship,
    entity_labels: dict[str, str],
) -> RelationshipSnapshot:
    return RelationshipSnapshot(
        subject=entity_labels.get(relationship.subject_entity_id, relationship.subject_entity_id),
        predicate_label=relationship.label,
        object=entity_labels.get(relationship.object_entity_id, relationship.object_entity_id),
        relationship_type=relationship.relationship_type,
        cardinality=relationship.cardinality.text if relationship.cardinality else None,
    )


def _rule_snapshot(rule: Rule, entity_labels: dict[str, str]) -> RuleSnapshot:
    return RuleSnapshot(
        applies_to=entity_labels.get(rule.applies_to_entity_id, rule.applies_to_entity_id),
        severity=rule.severity,
        predicate=rule.predicate,
        operator=rule.operator,
        value=rule.value
        if rule.value is not None
        else (
            entity_labels.get(rule.value_entity_id, rule.value_entity_id)
            if rule.value_entity_id
            else None
        ),
    )


def _response_to_expansion_plan(content: Any) -> EntityExpansionPlan:
    if isinstance(content, EntityExpansionPlan):
        return content
    if hasattr(content, "model_dump"):
        return EntityExpansionPlan.model_validate(content.model_dump(mode="json"))
    if isinstance(content, str):
        return EntityExpansionPlan.model_validate_json(content)
    if isinstance(content, dict):
        return EntityExpansionPlan.model_validate(content)
    raise TypeError(f"Unsupported entity expansion response type: {type(content)!r}")
