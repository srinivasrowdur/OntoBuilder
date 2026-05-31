---
name: contract-management-ontology
description: Contract-management ontology overlay for agreements, documents, parties, clauses, obligations, rights, amendments, renewals, notices, and lifecycle status.
license: Apache-2.0
metadata:
  version: "1.0.0"
  tags: ["contract", "contract-management", "domain-overlay"]
  triggers:
    - contract management
    - contract
    - contracts
    - agreement
    - agreements
    - clause
    - clauses
    - obligation
    - obligations
    - right
    - rights
    - renewal
    - termination
---

# Contract Management Ontology Skill

Use this skill when the scope or domain involves contract management.

## Scope Discipline

When contract management is a scope for another domain, use this as an overlay. Do not let generic contract concepts replace the primary domain concepts.

## Core Overlay Concepts

- Contract: the legal arrangement or agreement being managed.
- Contract Document: the source artifact that records contract terms.
- Party: a person or organization bound by or participating in a contract.
- Clause: a provision within a contract document.
- Obligation: a duty created by a clause or contract.
- Right: an entitlement created by a clause or contract.
- Notice: a formal communication used to exercise a right or trigger an event.
- Amendment Event: an event that changes contract terms.
- Renewal Event: an event that extends or restarts a contract term.
- Termination Event: an event that ends a contract or obligation.

## Relationship Patterns

- A Contract has one or more Parties.
- A Contract is recorded in a Contract Document.
- A Contract contains one or more Clauses.
- A Clause creates an Obligation.
- A Clause grants a Right.
- An Obligation is assigned to a Party.
- A Right may require a Notice.
- An Amendment Event amends a Contract.
- A Renewal Event renews a Contract.
- A Termination Event terminates a Contract.
