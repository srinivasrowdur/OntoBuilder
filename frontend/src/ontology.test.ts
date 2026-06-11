import { describe, expect, it } from "vitest";
import { getReadinessReport, stepStatementId } from "./ontology";
import type { DraftReviewSession, OntologyDraft, ReviewStatus, StatementReview } from "./types";

const draft: OntologyDraft = {
  assumptions: [],
  competency_questions: [],
  domain: "retirements",
  entities: [],
  extension_points: [],
  namespace_suggestion: "https://example.com/retirements#",
  open_questions: ["Which jurisdictions apply?"],
  relationships: [],
  rules: [],
  scope: null,
  statements: [],
  summary: "A retirements ontology.",
};

function sessionWith(statuses: ReviewStatus[]): DraftReviewSession {
  const statements = statuses.map(
    (status, index) =>
      ({
        impact: { entities: [], relationships: [], rules: [] },
        statement: {
          id: `stmt_${index}`,
          kind: "relationship",
          object_entity_id: null,
          relationship_id: null,
          rule_id: null,
          subject_entity_id: "member",
          text: `Statement ${index}.`,
        },
        status,
      }) as unknown as StatementReview,
  );
  return {
    created_at: "",
    draft,
    id: "session",
    source_prompt: "",
    statements,
    updated_at: "",
  } as unknown as DraftReviewSession;
}

describe("getReadinessReport", () => {
  it("returns the draft stage for an empty session", () => {
    expect(getReadinessReport(null).stage).toBe("draft");
    expect(getReadinessReport(null).readiness).toBe(0);
  });

  it("counts pending and clarify statements as blocking", () => {
    const report = getReadinessReport(
      sessionWith(["pending", "needs_clarification", "accepted", "rejected"]),
    );
    expect(report.blockingCount).toBe(2);
    expect(report.decidedCount).toBe(2);
    expect(report.readiness).toBe(50);
    expect(report.stage).toBe("review");
    expect(report.openQuestions).toEqual(["Which jurisdictions apply?"]);
  });

  it("moves to resolve when only clarifications remain", () => {
    const report = getReadinessReport(sessionWith(["needs_clarification", "accepted"]));
    expect(report.stage).toBe("resolve");
  });

  it("reaches export when every statement is decided", () => {
    const report = getReadinessReport(sessionWith(["accepted", "edited", "rejected"]));
    expect(report.stage).toBe("export");
    expect(report.readiness).toBe(100);
    expect(report.committableCount).toBe(2);
  });
});

describe("stepStatementId", () => {
  const ids = ["s1", "s2", "s3"];

  it("steps forward and backward", () => {
    expect(stepStatementId(ids, "s1", 1)).toBe("s2");
    expect(stepStatementId(ids, "s2", -1)).toBe("s1");
  });

  it("clamps at the ends", () => {
    expect(stepStatementId(ids, "s3", 1)).toBe("s3");
    expect(stepStatementId(ids, "s1", -1)).toBe("s1");
  });

  it("enters the list when nothing is selected or selection left the list", () => {
    expect(stepStatementId(ids, null, 1)).toBe("s1");
    expect(stepStatementId(ids, null, -1)).toBe("s3");
    expect(stepStatementId(ids, "gone", 1)).toBe("s1");
    expect(stepStatementId([], "s1", 1)).toBeNull();
  });
});
