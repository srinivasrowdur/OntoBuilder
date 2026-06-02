from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from ontology_agent.review import (
    EntityReferenceRequest,
    EntityUpdateRequest,
    ReviewStore,
    StatementCreateRequest,
)
from ontology_agent.schema import Cardinality, Entity, Identifier
from ontology_agent.review import DraftReviewSession


RevisionIntent = Literal["rename_entity", "add_relationship", "add_rule", "expand_entity"]
ExpansionMode = Literal["ontology", "relationships", "rules"]
EntityExpansionCallable = Callable[
    [DraftReviewSession, Entity, str, ExpansionMode],
    list[StatementCreateRequest],
]


class MentionReference(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Identifier | None = None
    label: str | None = Field(default=None, min_length=1)
    token: str | None = Field(default=None, min_length=1)


class ProjectRevisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    draft_id: str = Field(..., min_length=1)
    instruction: str = Field(..., min_length=2)
    mentions: list[MentionReference] = Field(default_factory=list)


class RevisionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session: DraftReviewSession
    intent: RevisionIntent
    message: str


@dataclass(frozen=True)
class ResolvedMention:
    entity: Entity
    token: str
    start: int
    end: int


CARDINALITY_PATTERNS: tuple[tuple[str, int | None, int | None, str], ...] = (
    (r"\bzero\s+or\s+more\b", 0, None, "zero or more"),
    (r"\bone\s+or\s+more\b", 1, None, "one or more"),
    (r"\bat\s+least\s+one\b", 1, None, "at least one"),
    (r"\bexactly\s+one\b", 1, 1, "exactly one"),
    (r"\bat\s+most\s+one\b", 0, 1, "at most one"),
    (r"\bzero\s+or\s+one\b", 0, 1, "zero or one"),
)


def revise_review_session(
    store: ReviewStore,
    request: ProjectRevisionRequest,
    *,
    expand_entity: EntityExpansionCallable | None = None,
) -> RevisionResult:
    session = store.get(request.draft_id)
    instruction = _clean_instruction(request.instruction)
    mentions = _resolve_mentions(session, request.mentions, instruction)

    if "@" in instruction and not mentions:
        raise ValueError("No known entity mentions were found in the instruction.")

    rename = _parse_rename_instruction(instruction, mentions)
    if rename:
        mention, next_label = rename
        next_session = store.update_entity(
            session.id,
            mention.entity.id,
            EntityUpdateRequest(label=next_label),
        )
        return RevisionResult(
            session=next_session,
            intent="rename_entity",
            message=f"Renamed {mention.entity.label} to {next_label}.",
        )

    if len(mentions) == 1 and _is_entity_expansion_instruction(instruction):
        return _expand_entity_revision(store, session, instruction, mentions[0], expand_entity)

    if _contains_rule_severity(instruction):
        return _add_rule_revision(store, session, instruction, mentions)

    if len(mentions) >= 2:
        return _add_relationship_revision(store, session, instruction, mentions)

    raise ValueError(
        "Use @Entity mentions for a rename, relationship, rule, or entity expansion instruction."
    )


def _expand_entity_revision(
    store: ReviewStore,
    session: DraftReviewSession,
    instruction: str,
    mention: ResolvedMention,
    expand_entity: EntityExpansionCallable | None,
) -> RevisionResult:
    if expand_entity is None:
        raise ValueError("Entity expansion requires the ontology expansion agent.")

    mode = _expansion_mode_from_instruction(instruction)
    cleaned_instruction = _remove_mention_token(instruction, mention)
    statement_count = len(session.statements)
    expansion_requests = expand_entity(session, mention.entity, cleaned_instruction, mode)
    next_session = session
    for expansion_request in expansion_requests:
        next_session = store.add_statement(next_session.id, expansion_request)

    added_count = len(next_session.statements) - statement_count
    mode_label = {
        "ontology": "ontology",
        "relationships": "relationship",
        "rules": "rule",
    }[mode]
    return RevisionResult(
        session=next_session,
        intent="expand_entity",
        message=(
            f"Added {added_count} {mode_label} expansion statements for {mention.entity.label}."
            if added_count
            else f"No new {mode_label} expansion statements were available for {mention.entity.label}."
        ),
    )


def _add_relationship_revision(
    store: ReviewStore,
    session: DraftReviewSession,
    instruction: str,
    mentions: list[ResolvedMention],
) -> RevisionResult:
    subject = mentions[0]
    object_entity = mentions[1]
    between = instruction[subject.end : object_entity.start]
    cardinality, predicate_label = _extract_cardinality(between)
    predicate_label = _clean_predicate(predicate_label)

    if not predicate_label:
        raise ValueError(
            "Relationship instructions need a predicate phrase between two @Entity mentions."
        )

    payload = StatementCreateRequest(
        kind="relationship",
        subject=EntityReferenceRequest(id=subject.entity.id),
        predicate_label=predicate_label,
        object=EntityReferenceRequest(id=object_entity.entity.id),
        relationship_type=_infer_relationship_type(
            f"{predicate_label} {object_entity.entity.label}"
        ),
        cardinality=cardinality,
    )
    next_session = store.add_statement(session.id, payload)
    return RevisionResult(
        session=next_session,
        intent="add_relationship",
        message=(
            f"Added relationship: {subject.entity.label} "
            f"{predicate_label} {object_entity.entity.label}."
        ),
    )


def _add_rule_revision(
    store: ReviewStore,
    session: DraftReviewSession,
    instruction: str,
    mentions: list[ResolvedMention],
) -> RevisionResult:
    if not mentions:
        raise ValueError("Rule instructions need at least one @Entity mention.")

    target = mentions[0]
    value_entity = mentions[1] if len(mentions) > 1 else None
    severity = _extract_rule_severity(instruction)
    predicate_label = _rule_predicate_from_instruction(
        instruction,
        target,
        value_entity,
    )
    cardinality, _body_without_cardinality = _extract_cardinality(
        instruction[target.end : value_entity.start if value_entity else len(instruction)]
    )
    operator, value = _operator_value_from_cardinality(cardinality)
    statement_text = _normalize_statement_text(instruction, mentions)

    payload = StatementCreateRequest(
        kind="rule",
        applies_to=EntityReferenceRequest(id=target.entity.id),
        rule_type=_infer_rule_type(instruction, cardinality),
        severity=severity,
        predicate_label=predicate_label,
        operator=operator,
        value=value,
        value_entity=EntityReferenceRequest(id=value_entity.entity.id) if value_entity else None,
        statement_text=statement_text,
    )
    next_session = store.add_statement(session.id, payload)
    return RevisionResult(
        session=next_session,
        intent="add_rule",
        message=f"Added rule for {target.entity.label}.",
    )


def _resolve_mentions(
    session: DraftReviewSession,
    request_mentions: list[MentionReference],
    instruction: str,
) -> list[ResolvedMention]:
    if request_mentions:
        resolved: list[ResolvedMention] = []
        occupied: list[tuple[int, int]] = []
        for mention in request_mentions:
            entity = _entity_for_mention(session.draft.entities, mention)
            token_candidates = [
                mention.token,
                f"@{mention.label}" if mention.label else None,
                f"@{entity.label}",
                f"@{entity.id}",
            ]
            position = _first_available_position(
                instruction,
                [token for token in token_candidates if token],
                occupied,
            )
            if position is None:
                label = mention.label or entity.label
                raise ValueError(f"Could not locate @{label} in the instruction.")
            start, end, token = position
            occupied.append((start, end))
            resolved.append(ResolvedMention(entity=entity, token=token, start=start, end=end))
        return sorted(resolved, key=lambda mention: mention.start)

    return _scan_instruction_mentions(session.draft.entities, instruction)


def _entity_for_mention(
    entities: list[Entity],
    mention: MentionReference,
) -> Entity:
    if mention.id:
        for entity in entities:
            if entity.id == mention.id:
                return entity
        raise ValueError(f"Unknown entity mention id: {mention.id}")

    label = (mention.label or "").strip()
    for entity in entities:
        if entity.label.lower() == label.lower():
            return entity
    raise ValueError(f"Unknown entity mention: {label}")


def _scan_instruction_mentions(
    entities: list[Entity],
    instruction: str,
) -> list[ResolvedMention]:
    candidates: list[tuple[str, Entity]] = []
    for entity in entities:
        labels = [entity.label, entity.id, *entity.aliases]
        candidates.extend((f"@{label}", entity) for label in labels if label)
    candidates.sort(key=lambda item: len(item[0]), reverse=True)

    resolved: list[ResolvedMention] = []
    occupied: list[tuple[int, int]] = []
    for token, entity in candidates:
        for start, end in _find_token_positions(instruction, token):
            if _overlaps(start, end, occupied):
                continue
            occupied.append((start, end))
            resolved.append(
                ResolvedMention(entity=entity, token=instruction[start:end], start=start, end=end)
            )
    return sorted(resolved, key=lambda mention: mention.start)


def _parse_rename_instruction(
    instruction: str,
    mentions: list[ResolvedMention],
) -> tuple[ResolvedMention, str] | None:
    if not mentions:
        return None
    if not re.search(r"\b(?:rename|change|call)\b", instruction, re.I):
        return None

    match = re.search(r"\bto\s+(?P<label>[^@.]+)\.?$", instruction, re.I)
    if not match:
        return None

    label = _clean_label(match.group("label"))
    if not label:
        raise ValueError("Rename instructions need a new entity label.")
    return mentions[0], label


def _extract_rule_severity(instruction: str) -> Literal["must", "should", "may"]:
    match = re.search(r"\b(must|should|may)\b", instruction, re.I)
    if not match:
        raise ValueError("Rule instructions need must, should, or may.")
    return match.group(1).lower()  # type: ignore[return-value]


def _contains_rule_severity(instruction: str) -> bool:
    return bool(re.search(r"\b(?:must|should|may)\b", instruction, re.I))


def _is_entity_expansion_instruction(instruction: str) -> bool:
    return bool(
        re.search(
            r"\b(?:expand|extend|elaborate|detail|cover\s+more|add\s+more\s+detail|"
            r"tell\s+me\s+more|focus)\b|"
            r"\b(?:more|additional|new)\s+(?:relationships?|rules?|constraints?)\b",
            instruction,
            re.I,
        )
    )


def _expansion_mode_from_instruction(instruction: str) -> ExpansionMode:
    if re.search(
        r"\b(?:rules?|constraints?|validations?|guardrails?|polic(?:y|ies))\b", instruction, re.I
    ):
        return "rules"
    if re.search(
        r"\b(?:relationships?|relations?|graph|connected|neighbou?rs?)\b|"
        r"\b(?:related|more|additional|new)\s+entities\b",
        instruction,
        re.I,
    ):
        return "relationships"
    return "ontology"


def _remove_mention_token(instruction: str, mention: ResolvedMention) -> str:
    cleaned = f"{instruction[: mention.start]}{instruction[mention.end :]}".strip()
    cleaned = re.sub(r"^(?:on|about|for|this entity)\b", "", cleaned, flags=re.I).strip()
    return cleaned or f"Expand {mention.entity.label}"


def _rule_predicate_from_instruction(
    instruction: str,
    target: ResolvedMention,
    value_entity: ResolvedMention | None,
) -> str:
    end = value_entity.start if value_entity else len(instruction)
    fragment = instruction[target.end : end]
    severity_match = re.search(r"\b(?:must|should|may)\b(?P<body>.*)$", fragment, re.I)
    body = severity_match.group("body") if severity_match else fragment
    _cardinality, body = _extract_cardinality(body)
    body = _compact_whitespace(body)
    body = re.sub(r"^(?:have|has|be|is|include|includes|contain|contains)\b", "", body, flags=re.I)
    body = _clean_predicate(body)

    if value_entity:
        if not body:
            return value_entity.entity.label
        if value_entity.entity.label.lower() not in body.lower():
            return f"{body} {value_entity.entity.label}".strip()
    return body or "validation"


def _extract_cardinality(fragment: str) -> tuple[Cardinality | None, str]:
    for pattern, min_count, max_count, text in CARDINALITY_PATTERNS:
        if re.search(pattern, fragment, re.I):
            stripped = re.sub(pattern, " ", fragment, flags=re.I)
            return Cardinality(min_count=min_count, max_count=max_count, text=text), stripped
    return None, fragment


def _operator_value_from_cardinality(
    cardinality: Cardinality | None,
) -> tuple[str, int | None]:
    if not cardinality:
        return "exists", None
    if cardinality.min_count == 1 and cardinality.max_count is None:
        return "min_count", 1
    if cardinality.min_count == 0 and cardinality.max_count == 1:
        return "max_count", 1
    if cardinality.min_count == 1 and cardinality.max_count == 1:
        return "eq", 1
    return "exists", None


def _infer_relationship_type(phrase: str) -> str:
    lowered = phrase.lower()
    if re.search(r"\b(?:classified|categorized|category|type)\b", lowered):
        return "classification"
    if re.search(r"\b(?:consists|contains|includes|part of|comprises)\b", lowered):
        return "composition"
    if re.search(
        r"\b(?:owns|holds|pays|receives|trades|issues|aum|cashflow|account|etf)\b", lowered
    ):
        return "financial"
    if re.search(r"\b(?:approved|owned by|governed|control|compliance|satisfies)\b", lowered):
        return "governance"
    if re.search(r"\b(?:expires|effective|date|time|period|month|year)\b", lowered):
        return "temporal"
    return "association"


def _infer_rule_type(
    instruction: str,
    cardinality: Cardinality | None,
) -> str:
    lowered = instruction.lower()
    if cardinality:
        return "cardinality"
    if re.search(r"\b(?:month|year|day|date|period|frequency|tested)\b", lowered):
        return "temporal"
    if re.search(r"\b(?:comply|compliance|regulation|policy|control)\b", lowered):
        return "compliance"
    if re.search(r"\b(?:status|amount|value|level|threshold|score)\b", lowered):
        return "value_constraint"
    return "validation"


def _normalize_statement_text(
    instruction: str,
    mentions: list[ResolvedMention],
) -> str:
    text = instruction.strip()
    for mention in sorted(mentions, key=lambda item: item.start, reverse=True):
        text = f"{text[: mention.start]}{mention.entity.label}{text[mention.end :]}"
    text = _compact_whitespace(text).strip(" ;,")
    first_entity = mentions[0].entity if mentions else None
    if first_entity and text.lower().startswith(first_entity.label.lower()):
        text = f"{_article(first_entity.label).capitalize()} {text}"
    return text if text.endswith(".") else f"{text}."


def _first_available_position(
    instruction: str,
    tokens: list[str],
    occupied: list[tuple[int, int]],
) -> tuple[int, int, str] | None:
    for token in tokens:
        for start, end in _find_token_positions(instruction, token):
            if not _overlaps(start, end, occupied):
                return start, end, instruction[start:end]
    return None


def _find_token_positions(instruction: str, token: str) -> list[tuple[int, int]]:
    positions: list[tuple[int, int]] = []
    pattern = re.compile(re.escape(token), re.I)
    for match in pattern.finditer(instruction):
        positions.append((match.start(), match.end()))
    return positions


def _overlaps(
    start: int,
    end: int,
    ranges: list[tuple[int, int]],
) -> bool:
    return any(not (end <= range_start or start >= range_end) for range_start, range_end in ranges)


def _clean_instruction(instruction: str) -> str:
    return _compact_whitespace(instruction).strip()


def _clean_predicate(value: str) -> str:
    value = _compact_whitespace(value)
    value = value.strip(" .,:;\"'")
    value = re.sub(r"^(?:a|an|the)\s+", "", value, flags=re.I)
    return value.strip()


def _clean_label(value: str) -> str:
    return _compact_whitespace(value).strip(" .,:;\"'")


def _compact_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _article(label: str) -> str:
    return "an" if label[:1].lower() in {"a", "e", "i", "o", "u"} else "a"
