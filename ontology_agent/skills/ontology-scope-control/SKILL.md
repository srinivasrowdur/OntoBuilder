---
name: ontology-scope-control
description: Keeps the requested domain primary while treating scope as a modeling lens, boundary, or use-case filter.
license: Apache-2.0
metadata:
  version: "1.0.0"
  tags: ["ontology", "scope"]
---

# Scope Control Skill

Use this skill before concept gathering.

## Rules

- The `domain` is the ontology subject.
- The `scope` narrows or frames the domain; it must not replace the domain.
- If the domain is `retirements` and the scope is `Contract Management`, keep retirement entities in the ontology and add contract-management concepts only where they govern retirement arrangements.
- If a scope term is broad, model it as an application lens and record assumptions or open questions.
- Prefer domain-specific entities first, then overlay workflow, document, compliance, or contract-management entities.

## Output Implications

- `domain` in JSON must remain the requested domain.
- `summary` must mention both the domain and the scope when scope is supplied.
- `assumptions` should explain how scope was interpreted.
