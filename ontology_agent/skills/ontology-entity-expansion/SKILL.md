---
name: ontology-entity-expansion
description: Expands one existing ontology entity by proposing additional candidate entities, relationships, rules, and reviewable statements.
license: Apache-2.0
metadata:
  version: "1.0.0"
  tags: ["ontology", "entity-expansion", "relationships", "statements"]
---

# Entity Expansion Skill

Use this skill when the user mentions one entity with `@Entity` and asks to
expand, extend, cover more, add detail, or go deeper.

## Intent

The user wants more ontology structure, not a prose description. Produce
candidate relationships, related entities, and rules that can become pending
review statements.

Honor the requested mode:

- `ontology`: propose useful relationships, neighboring entities, and rules.
- `relationships`: propose relationships and neighboring entities only.
- `rules`: propose rule statements only.

## Process

1. Treat the mentioned entity as the expansion focus.
2. Read the current entities, relationships, rules, and statements.
3. Apply the requested mode before generating candidates.
4. Identify important missing neighboring concepts around the focus entity:
   identifiers, classifications, participant roles, lifecycle states, events,
   places, documents, measures, exceptions, and governance constraints.
5. Reuse an existing entity label when the concept already exists.
6. Propose new entity labels only when the current ontology lacks the concept.
7. Prefer relationship candidates before rule candidates in `ontology` mode.
8. Add cardinality when the domain expectation is obvious.

## Quality Bar

- Do not duplicate current relationships or rules.
- Do not produce explanatory notes as the output.
- Keep predicate labels short and readable.
- Keep candidate object labels singular.
- Mark uncertain rules as `should` rather than `must`.
- Avoid overfitting to implementation/UI fields unless the domain is explicitly software or data modeling.

## Output Implications

The app will convert each candidate into a pending review statement. The user
can accept, reject, or edit them before commit.
