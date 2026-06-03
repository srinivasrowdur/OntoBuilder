import type {
  DraftReviewSession,
  NaturalLanguageStatement,
  OntologyDraft,
  Relationship,
  ReviewStatus,
  Rule,
  StatementReview,
} from "./types";

export const STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  needs_clarification: "Clarify",
  edited: "Edited",
};

export function draftForDisplay(session: DraftReviewSession | null): OntologyDraft | null {
  if (!session) {
    return null;
  }

  return {
    ...session.draft,
    statements: session.statements.map((review) => review.statement),
  };
}

export function getReviewCounts(reviews: StatementReview[]) {
  return reviews.reduce(
    (counts, review) => {
      counts[review.status] += 1;
      return counts;
    },
    {
      pending: 0,
      accepted: 0,
      edited: 0,
      rejected: 0,
      needs_clarification: 0,
    } as Record<ReviewStatus, number>,
  );
}

export function getReadiness(draft: OntologyDraft | null) {
  if (!draft) {
    return { readiness: 0, blockingIssues: 0 };
  }
  const blockingIssues = Math.min(2, draft.open_questions.length);
  const readiness = Math.max(
    70,
    98 - blockingIssues * 3 - Math.max(1, Math.floor(draft.assumptions.length / 2)),
  );
  return { readiness, blockingIssues };
}

export function relationshipById(
  draft: OntologyDraft,
  relationshipId?: string | null,
): Relationship | undefined {
  return draft.relationships.find((relationship) => relationship.id === relationshipId);
}

export function ruleById(draft: OntologyDraft, ruleId?: string | null): Rule | undefined {
  return draft.rules.find((rule) => rule.id === ruleId);
}

export function ruleValuePhrase(rule: Rule): string | null {
  if (rule.value === null || rule.value === undefined) {
    return null;
  }

  if (rule.operator === "gt") {
    return `greater than ${rule.value}`;
  }
  if (rule.operator === "gte") {
    return `greater than or equal to ${rule.value}`;
  }
  if (rule.operator === "lt") {
    return `less than ${rule.value}`;
  }
  if (rule.operator === "lte") {
    return `less than or equal to ${rule.value}`;
  }
  if (rule.operator === "eq") {
    return `equal to ${rule.value}`;
  }
  return String(rule.value);
}

export function statementStatus(
  session: DraftReviewSession | null,
  statement: NaturalLanguageStatement,
): ReviewStatus {
  return (
    session?.statements.find((review) => review.statement.id === statement.id)?.status ?? "pending"
  );
}
