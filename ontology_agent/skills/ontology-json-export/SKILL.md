---
name: ontology-json-export
description: Finalizes the ontology draft as strict schema-compliant JSON with no prose, logs, markdown, or terminal text.
license: Apache-2.0
metadata:
  version: "1.0.0"
  tags: ["ontology", "json", "export"]
---

# JSON Export Skill

Use this skill for the final response.

## Export Rules

- Return only the `OntologyDraft` JSON object.
- Do not include markdown fences.
- Do not include comments.
- Do not include terminal output, logs, or explanatory prose.
- Ensure all ids are `snake_case`.
- Ensure all arrays are present even when empty.
- Ensure the final object validates against the output schema.
