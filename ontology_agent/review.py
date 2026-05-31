from __future__ import annotations

import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ontology_agent.schema import Identifier, NaturalLanguageStatement, OntologyDraft


ReviewStatus = Literal["pending", "accepted", "rejected", "needs_clarification", "edited"]
COMMITTABLE_STATUSES: set[ReviewStatus] = {"accepted", "edited"}


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
