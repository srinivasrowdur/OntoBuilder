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

export type ReadinessStage = "draft" | "review" | "resolve" | "export";

export interface ReadinessReport {
  readiness: number;
  totalCount: number;
  decidedCount: number;
  blockingCount: number;
  pendingCount: number;
  clarifyCount: number;
  committableCount: number;
  openQuestions: string[];
  stage: ReadinessStage;
}

const EMPTY_READINESS: ReadinessReport = {
  readiness: 0,
  totalCount: 0,
  decidedCount: 0,
  blockingCount: 0,
  pendingCount: 0,
  clarifyCount: 0,
  committableCount: 0,
  openQuestions: [],
  stage: "draft",
};

export function getReadinessReport(session: DraftReviewSession | null): ReadinessReport {
  if (!session || session.statements.length === 0) {
    return EMPTY_READINESS;
  }
  const counts = getReviewCounts(session.statements);
  const totalCount = session.statements.length;
  const pendingCount = counts.pending;
  const clarifyCount = counts.needs_clarification;
  const blockingCount = pendingCount + clarifyCount;
  const decidedCount = totalCount - blockingCount;
  const committableCount = counts.accepted + counts.edited;
  const stage: ReadinessStage =
    pendingCount > 0 ? "review" : clarifyCount > 0 ? "resolve" : "export";
  return {
    readiness: Math.round((decidedCount / totalCount) * 100),
    totalCount,
    decidedCount,
    blockingCount,
    pendingCount,
    clarifyCount,
    committableCount,
    openQuestions: session.draft.open_questions,
    stage,
  };
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

export function stepStatementId(
  statementIds: string[],
  currentId: string | null,
  delta: 1 | -1,
): string | null {
  if (statementIds.length === 0) {
    return null;
  }
  const currentIndex = currentId ? statementIds.indexOf(currentId) : -1;
  if (currentIndex === -1) {
    return delta === 1 ? statementIds[0] : statementIds[statementIds.length - 1];
  }
  const nextIndex = Math.min(Math.max(currentIndex + delta, 0), statementIds.length - 1);
  return statementIds[nextIndex];
}

export function statementStatus(
  session: DraftReviewSession | null,
  statement: NaturalLanguageStatement,
): ReviewStatus {
  return (
    session?.statements.find((review) => review.statement.id === statement.id)?.status ?? "pending"
  );
}
