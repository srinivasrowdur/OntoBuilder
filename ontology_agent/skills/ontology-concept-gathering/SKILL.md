---
name: ontology-concept-gathering
description: Identifies candidate ontology entities from a domain, scope, and domain skill, then organizes them into stable classes, roles, documents, events, states, attributes, and values.
license: Apache-2.0
metadata:
  version: "1.0.0"
  tags: ["ontology", "entities", "concepts"]
---

# Concept Gathering Skill

Use this skill to produce the `entities` array.

## Process

1. Collect domain nouns and noun phrases.
2. Separate legal or business roles from physical documents, lifecycle events, states, attributes, and value sets.
3. Prefer singular labels.
4. Use stable `snake_case` ids derived from labels.
5. Use parent links only for true subtype or specialization relationships.
6. Keep examples short and domain-specific when available.

## Entity Type Guidance

- Use `class` for durable domain concepts.
- Use `role` for participant positions such as member, beneficiary, sponsor, trustee, administrator, or party.
- Use `document` for source artifacts.
- Use `event` for time-stamped changes such as enrollment, contribution, renewal, withdrawal, amendment, or termination.
- Use `state` for lifecycle values such as active, suspended, terminated, retired, or vested.
- Use `attribute` or `value` only when the concept is mainly a property or controlled value set.

## Quality Bar

- Include enough entities to support the relationships and rules.
- Avoid generic concepts if a domain-specific concept is available.
- Do not make `Contract` a document if `Contract Document` is also present; model the legal arrangement as `class` and the artifact as `document`.
