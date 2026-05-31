---
name: ontology-consistency-validation
description: Checks ontology drafts for reference integrity, domain drift, statement coverage, cardinality/text mismatch, and duplicate or weak modeling.
license: Apache-2.0
metadata:
  version: "1.0.0"
  tags: ["ontology", "validation", "quality"]
---

# Consistency Validation Skill

Use this skill immediately before final JSON export.

## Checks

- Every entity reference points to an existing entity.
- Every relationship has a statement.
- Every rule has a statement.
- Relationship statement subject/object match the linked relationship.
- Rule statement subject matches the linked rule target.
- Cardinality text agrees with `min_count` and `max_count`.
- Domain entities are not displaced by scope entities.
- Parent entities are true supertypes.
- Rule values use the correct datatype.
- Competency questions reference existing entities and relationships.

## Repair Rules

- If a relationship or rule has no statement, add one.
- If a statement contradicts cardinality, fix the statement or cardinality.
- If scope concepts dominate the draft, add domain concepts and move scope concepts into assumptions or extension points.
- If a concept is only a source artifact, type it as `document`; otherwise prefer `class`, `role`, or `event`.
