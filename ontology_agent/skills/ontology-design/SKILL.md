---
name: ontology-design
description: Lightweight orchestrator skill that explains the modular ontology workflow and delegates detailed work to smaller skills.
license: Apache-2.0
metadata:
  version: "1.0.0"
  tags: ["ontology", "orchestration"]
---

# Ontology Design Orchestrator

Use this only as the workflow map. The detailed modeling behavior belongs in the smaller skills.

## Skill Order

1. `ontology-scope-control`
2. `ontology-concept-gathering`
3. `ontology-relationship-design`
4. `ontology-rule-design`
5. `ontology-statement-rendering`
6. `ontology-consistency-validation`
7. `ontology-json-export`

Load a domain skill after the core workflow skills when one matches the user's domain, for example `retirement-ontology`.
