import type {
  CommitResponse,
  DraftReviewSession,
  Identifier,
  ReviewStatus,
} from "./types";

const API_BASE_URL =
  import.meta.env.VITE_ONTOLOGY_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";

async function requestJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      detail = await response.text();
    }
    throw new Error(`API ${response.status}: ${detail}`);
  }

  return (await response.json()) as T;
}

export function createSampleDraft(): Promise<DraftReviewSession> {
  return requestJson<DraftReviewSession>("/api/ontology/drafts/samples/retirements", {
    method: "POST",
  });
}

export function createDraft(prompt: string): Promise<DraftReviewSession> {
  return requestJson<DraftReviewSession>("/api/ontology/drafts", {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
}

export function reviewStatement(
  draftId: string,
  statementId: Identifier,
  status: ReviewStatus,
  text?: string,
): Promise<unknown> {
  return requestJson(`/api/ontology/drafts/${draftId}/statements/${statementId}`, {
    method: "PATCH",
    body: JSON.stringify({ status, ...(text ? { text } : {}) }),
  });
}

export function bulkReview(
  draftId: string,
  status: Exclude<ReviewStatus, "edited">,
  statementIds?: Identifier[],
): Promise<DraftReviewSession> {
  return requestJson<DraftReviewSession>(
    `/api/ontology/drafts/${draftId}/statements/review`,
    {
      method: "POST",
      body: JSON.stringify({ status, statement_ids: statementIds }),
    },
  );
}

export function getDraft(draftId: string): Promise<DraftReviewSession> {
  return requestJson<DraftReviewSession>(`/api/ontology/drafts/${draftId}`);
}

export function commitDraft(draftId: string): Promise<CommitResponse> {
  return requestJson<CommitResponse>(`/api/ontology/drafts/${draftId}/commit`, {
    method: "POST",
  });
}
