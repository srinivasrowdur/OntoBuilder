---
name: ontology-statement-rendering
description: Renders every relationship and rule as a natural-language statement linked back to the structured JSON object.
license: Apache-2.0
metadata:
  version: "1.0.0"
  tags: ["ontology", "statements", "ui"]
---

# Statement Rendering Skill

Use this skill to produce the `statements` array.

## Coverage Requirement

- Every relationship must have exactly one or more relationship statements.
- Every rule must have exactly one or more rule statements.
- Do not omit statements for secondary relationships or rules.

## Relationship Statement Rules

- `kind` must be `relationship`.
- `relationship_id` must point to the relationship.
- `subject_entity_id` must equal the relationship subject.
- `object_entity_id` must equal the relationship object.
- Text should follow this pattern: `A/An {Subject Label} {relationship label} a/an/one or more {Object Label}.`

## Rule Statement Rules

- `kind` must be `rule`.
- `rule_id` must point to the rule.
- `subject_entity_id` must equal the rule's `applies_to_entity_id`.
- Text should follow this pattern: `A/An {Subject Label} {severity phrase} {constraint phrase}.`

## Style

- Keep statements short.
- Use domain labels, not ids.
- Make cardinality visible in text when it matters.
