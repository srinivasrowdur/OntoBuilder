---
name: ontology-rule-design
description: Converts modals, constraints, eligibility requirements, value restrictions, lifecycle requirements, and calculations into structured rules.
license: Apache-2.0
metadata:
  version: "1.0.0"
  tags: ["ontology", "rules", "validation"]
---

# Rule Design Skill

Use this skill to produce the `rules` array.

## Process

1. Look for modal language: must, should, may, required, optional, eligible, prohibited.
2. Convert value constraints into `value_constraint` rules.
3. Convert participation or object count constraints into `cardinality` rules.
4. Convert enrollment, qualification, withdrawal, vesting, or entitlement rules into `eligibility` rules.
5. Convert date ordering and lifecycle gates into `temporal` or `lifecycle` rules.
6. Use `calculation` only when the output depends on known inputs or formulas.

## Quality Bar

- `applies_to_entity_id` must be the subject of the rule statement.
- Use numeric values as numbers, not strings.
- Use `value_entity_id` when the value is another ontology entity.
- Add a concise rationale and an implementation hint.
- Mark jurisdiction-sensitive rules as assumptions or open questions when no jurisdiction is supplied.
