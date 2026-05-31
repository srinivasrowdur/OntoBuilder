---
name: retirement-ontology
description: Retirement, pension, and savings-plan ontology guidance covering members, schemes, sponsors, contributions, beneficiaries, benefits, eligibility, and lifecycle events.
license: Apache-2.0
metadata:
  version: "1.0.0"
  tags: ["retirement", "pension", "benefits"]
  triggers:
    - retirement
    - retirements
    - pension
    - pensions
    - pension scheme
    - pension schemes
    - workplace pension
    - workplace pensions
    - 401(k)
    - 401k
    - defined benefit
    - defined contribution
    - superannuation
---

# Retirement Ontology Skill

Use this skill when the domain includes retirement, pensions, superannuation, 401(k), defined benefit plans, defined contribution plans, savings plans, or workplace benefits.

## Core Entities

- Member: a person participating in a retirement arrangement.
- Pension Scheme: a retirement plan or scheme that governs contributions, benefits, eligibility, and administration.
- Employer: an organization that sponsors or contributes to a scheme.
- Sponsor: a party responsible for establishing or supporting a scheme.
- Trustee: a fiduciary or governing party responsible for scheme assets or oversight.
- Administrator: a party responsible for operational administration.
- Contribution: a payment or allocation made into the scheme.
- Benefit: an entitlement payable to a member or beneficiary.
- Beneficiary: a person or party nominated to receive benefits.
- Investment Fund: a fund or option where scheme assets may be invested.
- Account: a member-level record of contributions, balances, and transactions.
- Enrollment Event: the event by which a member joins a scheme.
- Retirement Event: the event that triggers retirement status or benefit availability.
- Withdrawal Event: an event where funds or benefits are paid out.

## Relationship Patterns

- A Member belongs to a Pension Scheme.
- An Employer sponsors a Pension Scheme.
- A Member makes one or more Contributions.
- A Contribution is allocated to an Account.
- A Member names a Beneficiary.
- A Pension Scheme offers Investment Funds.
- A Trustee governs a Pension Scheme.
- An Administrator administers a Pension Scheme.
- A Retirement Event triggers a Benefit.

## Rule Patterns

- A Contribution must have an amount greater than 0.
- A Contribution should have an effective date.
- A Member must satisfy eligibility criteria before enrollment.
- A Beneficiary nomination should identify a beneficiary and allocation percentage.
- Benefit calculations may depend on service period, salary history, contribution history, age, and scheme type.
- Withdrawal eligibility may depend on retirement age, hardship rules, vesting, and jurisdiction.
