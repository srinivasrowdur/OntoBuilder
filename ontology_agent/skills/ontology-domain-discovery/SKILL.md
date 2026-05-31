---
name: ontology-domain-discovery
description: Generic domain discovery skill for building an ontology from any user-supplied domain, even when no domain-specific skill exists.
license: Apache-2.0
metadata:
  version: "1.0.0"
  tags: ["ontology", "domain-discovery", "generic"]
---

# Domain Discovery Skill

Use this skill for every ontology request.

## Purpose

Users may ask for any domain. Do not require a prebuilt domain skill. Use this generic discovery process to identify likely concepts, relationships, and rules from the domain name, scope, and request text.

## Process

1. Restate the requested domain internally as the subject area to model.
2. Identify the major actors, resources, documents, events, states, measures, and policies in that domain.
3. Identify common lifecycle stages or workflows.
4. Identify domain transactions or interactions.
5. Identify rules, eligibility conditions, validations, calculations, or constraints that are likely important.
6. Add assumptions and open questions where the domain requires subject-matter confirmation.

## Quality Bar

- If no specialist skill matches, still produce a useful starter ontology.
- Avoid pretending uncertain domain rules are authoritative.
- Mark uncertain or jurisdiction-sensitive rules in assumptions or open questions.
- Prefer broadly useful domain primitives over narrow implementation details.
