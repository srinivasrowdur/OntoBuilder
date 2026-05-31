---
name: ontology-relationship-design
description: Turns domain verbs and structural dependencies into typed binary relationships with cardinality and inverse labels.
license: Apache-2.0
metadata:
  version: "1.0.0"
  tags: ["ontology", "relationships"]
---

# Relationship Design Skill

Use this skill to produce the `relationships` array.

## Process

1. Convert stable domain verbs into relationships.
2. Use relationship ids in the form `{subject}_{predicate}_{object}`.
3. Keep predicates as machine-friendly `snake_case`.
4. Keep labels as readable verbs or verb phrases.
5. Add cardinality where the phrase implies optional, exactly one, one or more, or bounded counts.
6. Add inverse labels when useful for graph traversal or UI display.

## Modeling Rules

- A relationship connects two entities. If the relationship needs amount, date, status, or provenance, reify it as an event or transaction entity.
- Use `composition` only when the object is structurally part of the subject.
- Use `lifecycle` for events that change state.
- Use `eligibility` for relationships involving criteria or qualifying conditions.
- Keep cardinality and statement text aligned. If the statement says "one or more", `min_count` must be at least `1`.
