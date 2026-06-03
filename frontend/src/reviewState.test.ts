import { describe, expect, it } from "vitest";
import {
  applyPreviewOverrides,
  extractPromptMentions,
  omitKey,
  setPreviewValue,
} from "./reviewState";
import type { Entity, OntologyDraft } from "./types";

const entities: Entity[] = [
  {
    aliases: ["Plan Member"],
    confidence: 0.9,
    description: "A participating person.",
    entity_type: "role",
    examples: [],
    id: "member",
    label: "Member",
  },
  {
    aliases: [],
    confidence: 0.9,
    description: "The member account.",
    entity_type: "class",
    examples: [],
    id: "member_account",
    label: "Member Account",
  },
  {
    aliases: [],
    confidence: 0.9,
    description: "An account.",
    entity_type: "class",
    examples: [],
    id: "account",
    label: "Account",
  },
];

const draft: OntologyDraft = {
  assumptions: [],
  competency_questions: [],
  domain: "retirements",
  entities,
  extension_points: [],
  namespace_suggestion: "https://example.com/retirements#",
  open_questions: [],
  relationships: [
    {
      confidence: 0.9,
      description: "A member owns one or more accounts.",
      id: "member_owns_account",
      label: "owns",
      object_entity_id: "account",
      predicate: "owns",
      relationship_type: "financial",
      subject_entity_id: "member",
    },
  ],
  rules: [
    {
      applies_to_entity_id: "member",
      confidence: 0.9,
      id: "member_has_beneficiary",
      operator: "exists",
      predicate: "has_beneficiary",
      rationale: "A beneficiary is needed for payout instructions.",
      rule_type: "validation",
      severity: "must",
      text: "A Member must have a Beneficiary.",
    },
  ],
  scope: "workplace pension schemes",
  statements: [
    {
      id: "statement_member_owns_account",
      kind: "relationship",
      object_entity_id: "account",
      predicate: "owns",
      relationship_id: "member_owns_account",
      subject_entity_id: "member",
      text: "A Member owns one or more Accounts.",
    },
    {
      id: "statement_member_has_beneficiary",
      kind: "rule",
      object_entity_id: null,
      predicate: "has_beneficiary",
      relationship_id: null,
      rule_id: "member_has_beneficiary",
      subject_entity_id: "member",
      text: "A Member must have a Beneficiary.",
    },
  ],
  summary: "Retirement ontology.",
};

describe("extractPromptMentions", () => {
  it("resolves labels, aliases, and ids", () => {
    expect(extractPromptMentions("rename @Plan Member and expand @account", entities)).toEqual([
      { id: "member", label: "Member", token: "@Plan Member" },
      { id: "account", label: "Account", token: "@account" },
    ]);
  });

  it("prefers the longest overlapping mention", () => {
    expect(extractPromptMentions("expand @Member Account", entities)).toEqual([
      { id: "member_account", label: "Member Account", token: "@Member Account" },
    ]);
  });
});

describe("applyPreviewOverrides", () => {
  it("previews entity labels across entities, statements, and rules", () => {
    const preview = applyPreviewOverrides(draft, { member: "Plan Member" }, {});

    expect(preview?.entities.find((entity) => entity.id === "member")?.label).toBe("Plan Member");
    expect(preview?.statements[0].text).toBe("A Plan Member owns one or more Accounts.");
    expect(preview?.rules[0].text).toBe("A Plan Member must have a Beneficiary.");
  });

  it("previews explicit statement text without mutating the original draft", () => {
    const preview = applyPreviewOverrides(
      draft,
      {},
      {
        statement_member_owns_account: "A Member owns one or more Retirement Accounts.",
      },
    );

    expect(preview?.statements[0].text).toBe("A Member owns one or more Retirement Accounts.");
    expect(draft.statements[0].text).toBe("A Member owns one or more Accounts.");
  });
});

describe("preview map helpers", () => {
  it("sets and removes preview values immutably", () => {
    const first = setPreviewValue({}, "member", "Plan Member");
    const second = omitKey(first, "member");

    expect(first).toEqual({ member: "Plan Member" });
    expect(second).toEqual({});
  });
});
