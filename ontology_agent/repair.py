from __future__ import annotations

import json
import re
from typing import Any

from ontology_agent.schema import OntologyDraft


def repair_ontology_draft_payload(payload: str | dict[str, Any]) -> OntologyDraft:
    """Repair common draft omissions, then validate against the strict schema."""
    data = json.loads(payload) if isinstance(payload, str) else dict(payload)
    _normalize_optional_links(data)
    _repair_statement_links(data)
    _drop_invalid_statement_links(data)
    _drop_invalid_competency_question_links(data)
    _add_missing_relationship_statements(data)
    _add_missing_rule_statements(data)
    return OntologyDraft.model_validate(data)


def _normalize_optional_links(data: dict[str, Any]) -> None:
    optional_entity_fields = {
        "parent_entity_id",
        "object_entity_id",
        "relationship_id",
        "rule_id",
        "value_entity_id",
    }
    optional_scalar_fields = {"scope", "value_datatype", "inverse_label", "implementation_hint"}

    for field in optional_scalar_fields:
        if _is_nullish(data.get(field)):
            data[field] = None

    for entity in data.get("entities", []):
        for field in optional_entity_fields | optional_scalar_fields:
            if _is_nullish(entity.get(field)):
                entity[field] = None

    for relationship in data.get("relationships", []):
        for field in optional_entity_fields | optional_scalar_fields:
            if _is_nullish(relationship.get(field)):
                relationship[field] = None

    for rule in data.get("rules", []):
        for field in optional_entity_fields | optional_scalar_fields:
            if _is_nullish(rule.get(field)):
                rule[field] = None

    for statement in data.get("statements", []):
        for field in optional_entity_fields | optional_scalar_fields:
            if _is_nullish(statement.get(field)):
                statement[field] = None


def _repair_statement_links(data: dict[str, Any]) -> None:
    relationships = {
        relationship["id"]: relationship for relationship in data.get("relationships", [])
    }
    rules = {rule["id"]: rule for rule in data.get("rules", [])}

    for statement in data.get("statements", []):
        relationship_id = statement.get("relationship_id")
        if statement.get("kind") == "relationship" and relationship_id in relationships:
            relationship = relationships[relationship_id]
            statement["subject_entity_id"] = relationship["subject_entity_id"]
            statement["object_entity_id"] = relationship["object_entity_id"]
        rule_id = statement.get("rule_id")
        if statement.get("kind") == "rule" and rule_id in rules:
            rule = rules[rule_id]
            statement["subject_entity_id"] = rule["applies_to_entity_id"]
            statement.setdefault("object_entity_id", rule.get("value_entity_id"))


def _drop_invalid_statement_links(data: dict[str, Any]) -> None:
    entity_ids = {entity["id"] for entity in data.get("entities", [])}
    relationship_ids = {relationship["id"] for relationship in data.get("relationships", [])}
    rule_ids = {rule["id"] for rule in data.get("rules", [])}
    repaired_statements = []

    for statement in data.get("statements", []):
        subject_entity_id = statement.get("subject_entity_id")
        object_entity_id = statement.get("object_entity_id")
        if subject_entity_id not in entity_ids:
            continue
        if object_entity_id and object_entity_id not in entity_ids:
            continue
        if statement.get("kind") == "relationship":
            if statement.get("relationship_id") not in relationship_ids:
                continue
        elif statement.get("kind") == "rule":
            if statement.get("rule_id") not in rule_ids:
                continue
        repaired_statements.append(statement)

    data["statements"] = repaired_statements


def _drop_invalid_competency_question_links(data: dict[str, Any]) -> None:
    entity_ids = {entity["id"] for entity in data.get("entities", [])}
    relationship_ids = {relationship["id"] for relationship in data.get("relationships", [])}

    for question in data.get("competency_questions", []):
        question["expected_entities"] = [
            entity_id
            for entity_id in question.get("expected_entities", [])
            if entity_id in entity_ids
        ]
        question["expected_relationships"] = [
            relationship_id
            for relationship_id in question.get("expected_relationships", [])
            if relationship_id in relationship_ids
        ]


def _add_missing_relationship_statements(data: dict[str, Any]) -> None:
    entity_labels = _entity_labels(data)
    statements = data.setdefault("statements", [])
    covered = {
        statement.get("relationship_id")
        for statement in statements
        if statement.get("kind") == "relationship"
    }

    for relationship in data.get("relationships", []):
        relationship_id = relationship["id"]
        if relationship_id in covered:
            continue
        subject_label = entity_labels.get(
            relationship["subject_entity_id"], relationship["subject_entity_id"]
        )
        object_label = entity_labels.get(
            relationship["object_entity_id"], relationship["object_entity_id"]
        )
        text = _relationship_statement_text(
            subject_label,
            relationship.get("label") or relationship["predicate"].replace("_", " "),
            object_label,
            relationship.get("cardinality"),
        )
        statements.append(
            {
                "id": _unique_statement_id(statements, relationship_id),
                "kind": "relationship",
                "text": text,
                "subject_entity_id": relationship["subject_entity_id"],
                "predicate": relationship.get("label") or relationship["predicate"],
                "object_entity_id": relationship["object_entity_id"],
                "relationship_id": relationship_id,
                "rule_id": None,
            }
        )


def _add_missing_rule_statements(data: dict[str, Any]) -> None:
    statements = data.setdefault("statements", [])
    covered = {
        statement.get("rule_id") for statement in statements if statement.get("kind") == "rule"
    }

    for rule in data.get("rules", []):
        rule_id = rule["id"]
        if rule_id in covered:
            continue
        statements.append(
            {
                "id": _unique_statement_id(statements, rule_id),
                "kind": "rule",
                "text": rule["text"],
                "subject_entity_id": rule["applies_to_entity_id"],
                "predicate": _rule_statement_predicate(rule),
                "object_entity_id": rule.get("value_entity_id"),
                "relationship_id": None,
                "rule_id": rule_id,
            }
        )


def _relationship_statement_text(
    subject_label: str,
    relationship_label: str,
    object_label: str,
    cardinality: dict[str, Any] | None,
) -> str:
    object_phrase = f"{_article(object_label)} {object_label}"
    if cardinality:
        cardinality_text = str(cardinality.get("text") or "").lower()
        min_count = cardinality.get("min_count")
        max_count = cardinality.get("max_count")
        if cardinality_text == "one or more" or (min_count == 1 and max_count is None):
            object_phrase = f"one or more {_pluralize(object_label)}"
        elif cardinality_text == "zero or more" or (min_count == 0 and max_count is None):
            object_phrase = f"zero or more {_pluralize(object_label)}"
        elif cardinality_text == "exactly one" or (min_count == 1 and max_count == 1):
            object_phrase = f"exactly one {object_label}"
        elif cardinality_text == "optional" or (min_count == 0 and max_count == 1):
            object_phrase = f"optionally {_article(object_label)} {object_label}"

    return f"{_article(subject_label).capitalize()} {subject_label} {relationship_label} {object_phrase}."


def _rule_statement_predicate(rule: dict[str, Any]) -> str:
    predicate = str(rule.get("predicate") or "").replace("_", " ")
    severity = str(rule.get("severity") or "").strip()
    return " ".join(part for part in [severity, predicate] if part)


def _entity_labels(data: dict[str, Any]) -> dict[str, str]:
    return {entity["id"]: entity["label"] for entity in data.get("entities", [])}


def _article(label: str) -> str:
    first = label.strip()[:1].lower()
    return "an" if first in {"a", "e", "i", "o", "u"} else "a"


def _pluralize(label: str) -> str:
    if label.endswith("y") and label[-2:].lower() not in {"ay", "ey", "iy", "oy", "uy"}:
        return f"{label[:-1]}ies"
    if label.endswith(("s", "x", "z", "ch", "sh")):
        return f"{label}es"
    return f"{label}s"


def _unique_statement_id(statements: list[dict[str, Any]], source_id: str) -> str:
    existing = {statement.get("id") for statement in statements}
    base = f"statement_{source_id}"
    candidate = base
    index = 2
    while candidate in existing:
        candidate = f"{base}_{index}"
        index += 1
    return _safe_identifier(candidate)


def _safe_identifier(value: str) -> str:
    text = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return text or "statement"


def _is_nullish(value: Any) -> bool:
    return isinstance(value, str) and value.strip().lower() in {"", "null", "none", "n/a"}
