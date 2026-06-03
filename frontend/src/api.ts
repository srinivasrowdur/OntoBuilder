import type {
  CommitResponse,
  DraftReviewSession,
  Identifier,
  MentionReference,
  ProjectRevisionResponse,
  ProjectSaveResponse,
  ProjectSummary,
  ReviewStatus,
  StatementCreatePayload,
} from "./types";

const API_BASE_URL =
  import.meta.env.VITE_ONTOLOGY_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";
const REQUEST_TIMEOUT_MS = 30_000;
const SAFE_RETRY_METHODS = new Set(["GET", "HEAD"]);

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const maxAttempts = SAFE_RETRY_METHODS.has(method) ? 2 : 1;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        if (attempt < maxAttempts && response.status >= 500) {
          continue;
        }
        throw await apiResponseError(response);
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = normalizeRequestError(error);
      if (attempt >= maxAttempts || !SAFE_RETRY_METHODS.has(method)) {
        throw lastError;
      }
    } finally {
      globalThis.clearTimeout(timeoutId);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("API request failed");
}

async function apiResponseError(response: Response) {
  let detail = response.statusText;
  try {
    const body = await response.json();
    detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
  } catch {
    detail = await response.text();
  }
  return new Error(`API ${response.status}: ${detail}`);
}

function normalizeRequestError(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return new Error(`API request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
  }
  return error instanceof Error ? error : new Error(String(error));
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

export function createStatement(
  draftId: string,
  payload: StatementCreatePayload,
): Promise<DraftReviewSession> {
  return requestJson<DraftReviewSession>(`/api/ontology/drafts/${draftId}/statements`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function bulkReview(
  draftId: string,
  status: Exclude<ReviewStatus, "edited">,
  statementIds?: Identifier[],
): Promise<DraftReviewSession> {
  return requestJson<DraftReviewSession>(`/api/ontology/drafts/${draftId}/statements/review`, {
    method: "POST",
    body: JSON.stringify({ status, statement_ids: statementIds }),
  });
}

export function getDraft(draftId: string): Promise<DraftReviewSession> {
  return requestJson<DraftReviewSession>(`/api/ontology/drafts/${draftId}`);
}

export function updateEntityLabel(
  draftId: string,
  entityId: Identifier,
  label: string,
): Promise<DraftReviewSession> {
  return requestJson<DraftReviewSession>(`/api/ontology/drafts/${draftId}/entities/${entityId}`, {
    method: "PATCH",
    body: JSON.stringify({ label }),
  });
}

export function commitDraft(draftId: string): Promise<CommitResponse> {
  return requestJson<CommitResponse>(`/api/ontology/drafts/${draftId}/commit`, {
    method: "POST",
  });
}

export function listProjects(): Promise<ProjectSummary[]> {
  return requestJson<ProjectSummary[]>("/api/projects");
}

export function createProject(name: string, description?: string): Promise<ProjectSummary> {
  return requestJson<ProjectSummary>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name, ...(description ? { description } : {}) }),
  });
}

export function saveProject(projectId: string, draftId: string): Promise<ProjectSaveResponse> {
  return requestJson<ProjectSaveResponse>(`/api/projects/${projectId}/save`, {
    method: "POST",
    body: JSON.stringify({ draft_id: draftId }),
  });
}

export function openProjectSession(projectId: string): Promise<DraftReviewSession> {
  return requestJson<DraftReviewSession>(`/api/projects/${projectId}/session`);
}

export function reviseProject(
  projectId: string,
  draftId: string,
  instruction: string,
  mentions: MentionReference[],
): Promise<ProjectRevisionResponse> {
  return requestJson<ProjectRevisionResponse>(`/api/projects/${projectId}/revise`, {
    method: "POST",
    body: JSON.stringify({
      draft_id: draftId,
      instruction,
      mentions,
    }),
  });
}
