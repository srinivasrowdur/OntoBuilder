from __future__ import annotations

import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ontology_agent.schema import (
    Cardinality,
    Entity,
    Identifier,
    NaturalLanguageStatement,
    OntologyDraft,
    Relationship,
    Rule,
)


ReviewStatus = Literal["pending", "accepted", "rejected", "needs_clarification", "edited"]
COMMITTABLE_STATUSES: set[ReviewStatus] = {"accepted", "edited"}
EntityType = Literal[
    "class",
    "role",
    "document",
    "event",
    "process",
    "state",
    "attribute",
    "value",
    "external_reference",
]
RelationshipType = Literal[
    "association",
    "composition",
    "classification",
    "participation",
    "financial",
    "temporal",
    "governance",
    "lifecycle",
    "eligibility",
]
RuleType = Literal[
    "cardinality",
    "value_constraint",
    "eligibility",
    "temporal",
    "calculation",
    "compliance",
    "lifecycle",
    "validation",
]
RuleOperator = Literal[
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


class ImpactReference(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Identifier
    label: str
    type: Literal["entity", "relationship", "rule"]


class StatementImpact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entities: list[ImpactReference] = Field(default_factory=list)
    relationships: list[ImpactReference] = Field(default_factory=list)
    rules: list[ImpactReference] = Field(default_factory=list)


class StatementReview(BaseModel):
    model_config = ConfigDict(extra="forbid")

    statement: NaturalLanguageStatement
    status: ReviewStatus = "pending"
    edited_text: str | None = None
    comment: str | None = None
    impact: StatementImpact


class DraftReviewSession(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    source_prompt: str
    draft: OntologyDraft
    statements: list[StatementReview]
    created_at: datetime
    updated_at: datetime


class StatementDecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: ReviewStatus
    text: str | None = Field(default=None, min_length=1)
    comment: str | None = None
    rename_map: dict[str, str] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_edit_payload(self) -> "StatementDecisionRequest":
        if self.status == "edited" and not self.text:
            raise ValueError("edited statements require text")
        return self


class BulkStatementDecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["pending", "accepted", "rejected", "needs_clarification"]
    statement_ids: list[Identifier] | None = None
    comment: str | None = None


class EntityUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str = Field(..., min_length=1)


class EntityReferenceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Identifier | None = None
    label: str | None = Field(default=None, min_length=1)
    entity_type: EntityType = "class"
    description: str | None = None

    @model_validator(mode="after")
    def validate_reference(self) -> "EntityReferenceRequest":
        if not self.id and not self.label:
            raise ValueError("entity reference requires id or label")
        return self


class StatementCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["relationship", "rule"]
    subject: EntityReferenceRequest | None = None
    object: EntityReferenceRequest | None = None
    predicate_label: str | None = Field(default=None, min_length=1)
    relationship_type: RelationshipType = "association"
    cardinality: Cardinality | None = None
    applies_to: EntityReferenceRequest | None = None
    rule_type: RuleType = "validation"
    severity: Literal["must", "should", "may"] = "must"
    operator: RuleOperator = "exists"
    value: str | int | float | bool | list[str] | None = None
    value_entity: EntityReferenceRequest | None = None
    value_datatype: str | None = None
    statement_text: str | None = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def validate_statement(self) -> "StatementCreateRequest":
        if self.kind == "relationship":
            if not self.subject or not self.object or not self.predicate_label:
                raise ValueError(
                    "relationship statements require subject, predicate_label, and object"
                )
        if self.kind == "rule":
            if not self.applies_to or not self.predicate_label:
                raise ValueError("rule statements require applies_to and predicate_label")
            if self.operator != "exists" and self.value is None and self.value_entity is None:
                raise ValueError("rule statements with this operator require a value")
        return self


class CommitResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    draft_id: str
    included_statement_ids: list[Identifier]
    ontology: OntologyDraft


class ReviewStore:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def create_session(self, draft: OntologyDraft, source_prompt: str) -> DraftReviewSession:
        now = _now()
        session = DraftReviewSession(
            id=uuid4().hex,
            source_prompt=source_prompt,
            draft=draft,
            statements=[
                StatementReview(
                    statement=statement,
                    status="pending",
                    impact=build_statement_impact(draft, statement),
                )
                for statement in draft.statements
            ],
            created_at=now,
            updated_at=now,
        )
        self.save(session)
        return session

    def get(self, draft_id: str) -> DraftReviewSession:
        path = self._path(draft_id)
        if not path.exists():
            raise KeyError(draft_id)
        return DraftReviewSession.model_validate_json(path.read_text())

    def save(self, session: DraftReviewSession) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        path = self._path(session.id)
        tmp_path = path.with_suffix(".tmp")
        tmp_path.write_text(session.model_dump_json(indent=2))
        tmp_path.replace(path)

    def update_statement(
        self,
        draft_id: str,
        statement_id: str,
        decision: StatementDecisionRequest,
    ) -> StatementReview:
        session = self.get(draft_id)
        review = _find_statement_review(session, statement_id)
        statement = review.statement

        if decision.text:
            statement = statement.model_copy(update={"text": decision.text})

        review_index = session.statements.index(review)
        session.statements[review_index] = review.model_copy(
            update={
                "statement": statement,
                "status": decision.status,
                "edited_text": decision.text if decision.status == "edited" else None,
                "comment": decision.comment,
            }
        )
        session.updated_at = _now()
        self.save(session)
        return session.statements[review_index]

    def bulk_update(
        self, draft_id: str, decision: BulkStatementDecisionRequest
    ) -> DraftReviewSession:
        session = self.get(draft_id)
        selected_ids = (
            set(decision.statement_ids)
            if decision.statement_ids is not None
            else {review.statement.id for review in session.statements}
        )
        known_ids = {review.statement.id for review in session.statements}
        missing_ids = selected_ids - known_ids
        if missing_ids:
            missing = ", ".join(sorted(missing_ids))
            raise KeyError(f"Unknown statement ids: {missing}")

        session.statements = [
            review.model_copy(
                update={
                    "status": decision.status,
                    "comment": decision.comment,
                    "edited_text": None,
                }
            )
            if review.statement.id in selected_ids
            else review
            for review in session.statements
        ]
        session.updated_at = _now()
        self.save(session)
        return session

    def update_entity(
        self,
        draft_id: str,
        entity_id: str,
        request: EntityUpdateRequest,
    ) -> DraftReviewSession:
        session = self.get(draft_id)
        entities = []
        old_label: str | None = None

        for entity in session.draft.entities:
            if entity.id == entity_id:
                old_label = entity.label
                entities.append(entity.model_copy(update={"label": request.label}))
            else:
                entities.append(entity)

        if old_label is None:
            raise KeyError(entity_id)

        if old_label == request.label:
            return session

        draft_statements = [
            statement.model_copy(
                update={
                    "text": _replace_entity_label(
                        statement.text,
                        old_label=old_label,
                        new_label=request.label,
                    )
                }
            )
            for statement in session.draft.statements
        ]
        rules = [
            rule.model_copy(
                update={
                    "text": _replace_entity_label(
                        rule.text,
                        old_label=old_label,
                        new_label=request.label,
                    )
                }
            )
            for rule in session.draft.rules
        ]
        draft = session.draft.model_copy(
            update={
                "entities": entities,
                "rules": rules,
                "statements": draft_statements,
            }
        )
        session.draft = draft
        session.statements = [
            review.model_copy(
                update={
                    "statement": review.statement.model_copy(
                        update={
                            "text": _replace_entity_label(
                                review.statement.text,
                                old_label=old_label,
                                new_label=request.label,
                            )
                        }
                    ),
                }
            )
            for review in session.statements
        ]
        session.statements = [
            review.model_copy(update={"impact": build_statement_impact(draft, review.statement)})
            for review in session.statements
        ]
        session.updated_at = _now()
        self.save(session)
        return session

    def add_statement(
        self,
        draft_id: str,
        request: StatementCreateRequest,
    ) -> DraftReviewSession:
        session = self.get(draft_id)
        if request.kind == "relationship":
            session = _add_relationship_statement(session, request)
        else:
            session = _add_rule_statement(session, request)
        session.updated_at = _now()
        self.save(session)
        return session

    def commit(self, draft_id: str) -> CommitResponse:
        session = self.get(draft_id)
        return commit_session(session)

    def _path(self, draft_id: str) -> Path:
        return self.root / f"{draft_id}.json"


def build_statement_impact(
    draft: OntologyDraft, statement: NaturalLanguageStatement
) -> StatementImpact:
    entities_by_id = {entity.id: entity for entity in draft.entities}
    relationships_by_id = {relationship.id: relationship for relationship in draft.relationships}
    rules_by_id = {rule.id: rule for rule in draft.rules}
    entity_ids = {statement.subject_entity_id}

    if statement.object_entity_id:
        entity_ids.add(statement.object_entity_id)

    relationships: list[ImpactReference] = []
    if statement.relationship_id and statement.relationship_id in relationships_by_id:
        relationship = relationships_by_id[statement.relationship_id]
        entity_ids.update([relationship.subject_entity_id, relationship.object_entity_id])
        relationships.append(
            ImpactReference(
                id=relationship.id,
                label=relationship.label,
                type="relationship",
            )
        )

    rules: list[ImpactReference] = []
    if statement.rule_id and statement.rule_id in rules_by_id:
        rule = rules_by_id[statement.rule_id]
        entity_ids.add(rule.applies_to_entity_id)
        if rule.value_entity_id:
            entity_ids.add(rule.value_entity_id)
        rules.append(ImpactReference(id=rule.id, label=rule.text, type="rule"))

    entities = [
        ImpactReference(id=entity.id, label=entity.label, type="entity")
        for entity_id in sorted(entity_ids)
        if (entity := entities_by_id.get(entity_id))
    ]
    return StatementImpact(
        entities=entities,
        relationships=relationships,
        rules=rules,
    )


def _add_relationship_statement(
    session: DraftReviewSession,
    request: StatementCreateRequest,
) -> DraftReviewSession:
    if request.subject is None or request.object is None or request.predicate_label is None:
        raise ValueError("relationship statement payload is incomplete")

    draft = session.draft
    entities = list(draft.entities)
    subject, entities = _resolve_entity(entities, request.subject)
    object_entity, entities = _resolve_entity(entities, request.object)
    predicate = _identifier(request.predicate_label, fallback="relates_to")
    relationship_ids = {relationship.id for relationship in draft.relationships}
    relationship_id = _unique_id(
        f"{subject.id}_{predicate}_{object_entity.id}",
        relationship_ids,
    )
    relationship = Relationship(
        id=relationship_id,
        subject_entity_id=subject.id,
        predicate=predicate,
        label=request.predicate_label.strip(),
        object_entity_id=object_entity.id,
        relationship_type=request.relationship_type,
        cardinality=request.cardinality,
        description=(f"{subject.label} {request.predicate_label.strip()} {object_entity.label}."),
        confidence=0.7,
    )
    statement = NaturalLanguageStatement(
        id=_unique_id(f"statement_{relationship_id}", {item.id for item in draft.statements}),
        kind="relationship",
        text=request.statement_text.strip()
        if request.statement_text
        else _relationship_statement_text(
            subject.label,
            relationship.label,
            object_entity.label,
            request.cardinality,
        ),
        subject_entity_id=subject.id,
        predicate=relationship.label,
        object_entity_id=object_entity.id,
        relationship_id=relationship.id,
    )
    next_draft = OntologyDraft(
        domain=draft.domain,
        scope=draft.scope,
        namespace_suggestion=draft.namespace_suggestion,
        summary=draft.summary,
        entities=entities,
        relationships=[*draft.relationships, relationship],
        rules=draft.rules,
        statements=[*draft.statements, statement],
        competency_questions=draft.competency_questions,
        assumptions=draft.assumptions,
        open_questions=draft.open_questions,
        extension_points=draft.extension_points,
    )
    return _with_added_review(session, next_draft, statement)


def _add_rule_statement(
    session: DraftReviewSession,
    request: StatementCreateRequest,
) -> DraftReviewSession:
    if request.applies_to is None or request.predicate_label is None:
        raise ValueError("rule statement payload is incomplete")

    draft = session.draft
    entities = list(draft.entities)
    applies_to, entities = _resolve_entity(entities, request.applies_to)
    value_entity: Entity | None = None
    if request.value_entity:
        value_entity, entities = _resolve_entity(entities, request.value_entity)

    predicate = _identifier(request.predicate_label, fallback="property")
    rule_ids = {rule.id for rule in draft.rules}
    value_token = str(request.value) if request.value is not None else "exists"
    value_id_part = value_entity.id if value_entity else _identifier(value_token)
    rule_id = _unique_id(
        f"{applies_to.id}_{predicate}_{request.operator}_{value_id_part}",
        rule_ids,
    )
    text = (
        request.statement_text.strip()
        if request.statement_text
        else _rule_statement_text(
            entity_label=applies_to.label,
            severity=request.severity,
            predicate_label=request.predicate_label.strip(),
            operator=request.operator,
            value=request.value,
            value_entity_label=value_entity.label if value_entity else None,
        )
    )
    rule = Rule(
        id=rule_id,
        applies_to_entity_id=applies_to.id,
        rule_type=request.rule_type,
        severity=request.severity,
        predicate=predicate,
        operator=request.operator,
        value=request.value,
        value_entity_id=value_entity.id if value_entity else None,
        value_datatype=request.value_datatype,
        text=text,
        rationale="Added during human ontology review.",
        implementation_hint="Review before mapping to SHACL, OWL, or application validation.",
        confidence=0.7,
    )
    statement = NaturalLanguageStatement(
        id=_unique_id(f"statement_{rule_id}", {item.id for item in draft.statements}),
        kind="rule",
        text=text,
        subject_entity_id=applies_to.id,
        predicate=_rule_statement_predicate(
            request.severity,
            request.predicate_label.strip(),
            request.operator,
        ),
        object_entity_id=value_entity.id if value_entity else None,
        rule_id=rule.id,
    )
    next_draft = OntologyDraft(
        domain=draft.domain,
        scope=draft.scope,
        namespace_suggestion=draft.namespace_suggestion,
        summary=draft.summary,
        entities=entities,
        relationships=draft.relationships,
        rules=[*draft.rules, rule],
        statements=[*draft.statements, statement],
        competency_questions=draft.competency_questions,
        assumptions=draft.assumptions,
        open_questions=draft.open_questions,
        extension_points=draft.extension_points,
    )
    return _with_added_review(session, next_draft, statement)


def _with_added_review(
    session: DraftReviewSession,
    draft: OntologyDraft,
    statement: NaturalLanguageStatement,
) -> DraftReviewSession:
    session.draft = draft
    session.statements = [
        *session.statements,
        StatementReview(
            statement=statement,
            status="pending",
            impact=build_statement_impact(draft, statement),
        ),
    ]
    return session


def _resolve_entity(
    entities: list[Entity],
    reference: EntityReferenceRequest,
) -> tuple[Entity, list[Entity]]:
    if reference.id:
        for entity in entities:
            if entity.id == reference.id:
                return entity, entities
        raise KeyError(reference.id)

    label = (reference.label or "").strip()
    for entity in entities:
        if entity.label.lower() == label.lower():
            return entity, entities

    entity_ids = {entity.id for entity in entities}
    entity = Entity(
        id=_unique_id(_identifier(label, fallback="entity"), entity_ids),
        label=label,
        entity_type=reference.entity_type,
        description=reference.description or f"{label} added during human ontology review.",
        aliases=[],
        examples=[],
        confidence=0.65,
    )
    return entity, [*entities, entity]


def commit_session(session: DraftReviewSession) -> CommitResponse:
    accepted_reviews = [
        review for review in session.statements if review.status in COMMITTABLE_STATUSES
    ]
    if not accepted_reviews:
        raise ValueError("No accepted statements are available to commit.")

    accepted_statements = [review.statement for review in accepted_reviews]
    relationship_ids = {
        statement.relationship_id
        for statement in accepted_statements
        if statement.kind == "relationship" and statement.relationship_id
    }
    rule_ids = {
        statement.rule_id
        for statement in accepted_statements
        if statement.kind == "rule" and statement.rule_id
    }
    relationships = [
        relationship
        for relationship in session.draft.relationships
        if relationship.id in relationship_ids
    ]
    rules = [rule for rule in session.draft.rules if rule.id in rule_ids]
    entity_ids = _committed_entity_ids(accepted_statements, relationships, rules)
    entities = [entity for entity in session.draft.entities if entity.id in entity_ids]
    competency_questions = [
        question
        for question in session.draft.competency_questions
        if set(question.expected_entities) <= entity_ids
        and set(question.expected_relationships) <= relationship_ids
    ]
    ontology = OntologyDraft(
        domain=session.draft.domain,
        scope=session.draft.scope,
        namespace_suggestion=session.draft.namespace_suggestion,
        summary=session.draft.summary,
        entities=entities,
        relationships=relationships,
        rules=rules,
        statements=accepted_statements,
        competency_questions=competency_questions,
        assumptions=session.draft.assumptions,
        open_questions=session.draft.open_questions,
        extension_points=session.draft.extension_points,
    )
    return CommitResponse(
        draft_id=session.id,
        included_statement_ids=[statement.id for statement in accepted_statements],
        ontology=ontology,
    )


def _committed_entity_ids(
    statements: list[NaturalLanguageStatement],
    relationships,
    rules,
) -> set[str]:
    entity_ids = {statement.subject_entity_id for statement in statements}
    entity_ids.update(
        statement.object_entity_id for statement in statements if statement.object_entity_id
    )
    for relationship in relationships:
        entity_ids.update([relationship.subject_entity_id, relationship.object_entity_id])
    for rule in rules:
        entity_ids.add(rule.applies_to_entity_id)
        if rule.value_entity_id:
            entity_ids.add(rule.value_entity_id)
    return entity_ids


def _find_statement_review(session: DraftReviewSession, statement_id: str) -> StatementReview:
    for review in session.statements:
        if review.statement.id == statement_id:
            return review
    raise KeyError(statement_id)


def _relationship_statement_text(
    subject_label: str,
    predicate_label: str,
    object_label: str,
    cardinality: Cardinality | None = None,
) -> str:
    if cardinality and cardinality.text:
        object_phrase = _cardinality_object_phrase(object_label, cardinality.text)
        return (
            f"{_article(subject_label).capitalize()} {subject_label} "
            f"{predicate_label} {cardinality.text} {object_phrase}."
        )
    return (
        f"{_article(subject_label).capitalize()} {subject_label} "
        f"{predicate_label} {_article(object_label)} {object_label}."
    )


def _cardinality_object_phrase(object_label: str, cardinality_text: str) -> str:
    if re.search(r"\b(?:zero|one|many)\s+or\s+more\b|\bat\s+least\b", cardinality_text, re.I):
        return _pluralize_label(object_label)
    return object_label


def _rule_statement_text(
    *,
    entity_label: str,
    severity: str,
    predicate_label: str,
    operator: str,
    value: str | int | float | bool | list[str] | None,
    value_entity_label: str | None,
) -> str:
    value_phrase = _rule_value_phrase(
        operator=operator,
        value=value,
        value_entity_label=value_entity_label,
    )
    if value_phrase:
        return (
            f"{_article(entity_label).capitalize()} {entity_label} {severity} "
            f"have {_article(predicate_label)} {predicate_label} {value_phrase}."
        )
    return (
        f"{_article(entity_label).capitalize()} {entity_label} {severity} "
        f"have {_article(predicate_label)} {predicate_label}."
    )


def _rule_statement_predicate(severity: str, predicate_label: str, operator: str) -> str:
    if operator == "exists":
        return f"{severity} have {predicate_label}"
    return f"{severity} have {predicate_label} {operator}"


def _rule_value_phrase(
    *,
    operator: str,
    value: str | int | float | bool | list[str] | None,
    value_entity_label: str | None,
) -> str:
    rendered_value = value_entity_label or _render_value(value)
    if operator == "exists":
        return ""
    if operator == "gt":
        return f"greater than {rendered_value}"
    if operator == "gte":
        return f"greater than or equal to {rendered_value}"
    if operator == "lt":
        return f"less than {rendered_value}"
    if operator == "lte":
        return f"less than or equal to {rendered_value}"
    if operator == "eq":
        return f"equal to {rendered_value}"
    if operator == "neq":
        return f"not equal to {rendered_value}"
    if operator == "min_count":
        return f"at least {rendered_value}"
    if operator == "max_count":
        return f"at most {rendered_value}"
    if operator == "in":
        return f"in {rendered_value}"
    if operator == "not_in":
        return f"not in {rendered_value}"
    if operator == "pattern":
        return f"matching {rendered_value}"
    return rendered_value


def _render_value(value: str | int | float | bool | list[str] | None) -> str:
    if isinstance(value, list):
        return ", ".join(value)
    if value is None:
        return ""
    return str(value)


def _article(label: str) -> str:
    return "an" if label[:1].lower() in {"a", "e", "i", "o", "u"} else "a"


def _unique_id(base: str, existing_ids: set[str]) -> str:
    candidate = _identifier(base, fallback="item")
    if candidate not in existing_ids:
        return candidate

    counter = 2
    while f"{candidate}_{counter}" in existing_ids:
        counter += 1
    return f"{candidate}_{counter}"


def _identifier(value: str, fallback: str = "item") -> str:
    identifier = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    identifier = re.sub(r"_+", "_", identifier)
    if not identifier or not identifier[0].isalpha():
        identifier = fallback
    return identifier


def _replace_entity_label(text: str, *, old_label: str, new_label: str) -> str:
    next_text = text
    if not old_label.lower().endswith("s"):
        next_text = re.sub(
            rf"\b{re.escape(old_label)}s\b",
            _pluralize_label(new_label),
            next_text,
            flags=re.IGNORECASE,
        )
    return re.sub(
        rf"\b{re.escape(old_label)}\b",
        new_label,
        next_text,
        flags=re.IGNORECASE,
    )


def _pluralize_label(label: str) -> str:
    if label.lower().endswith("s"):
        return label
    return f"{label}s"


def _now() -> datetime:
    return datetime.now(UTC)
