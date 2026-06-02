import { useEffect, useMemo, useState } from "react";
import {
  bulkReview,
  commitDraft,
  createDraft,
  createSampleDraft,
  createStatement,
  getDraft,
  reviewStatement,
  updateEntityLabel,
} from "./api";
import { OntologyCanvas } from "./components/OntologyCanvas";
import { ReviewSidebar } from "./components/ReviewSidebar";
import { draftForDisplay, getReviewCounts } from "./ontology";
import type {
  CommitResponse,
  DraftReviewSession,
  Entity,
  ReviewStatus,
  StatementCreatePayload,
} from "./types";

export function App() {
  const [session, setSession] = useState<DraftReviewSession | null>(null);
  const [selectedStatementId, setSelectedStatementId] = useState<string | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<CommitResponse | null>(null);

  const draft = useMemo(() => draftForDisplay(session), [session]);
  const selectedReview = useMemo(() => {
    if (!session) {
      return null;
    }
    const selected =
      session.statements.find((review) => review.statement.id === selectedStatementId) ??
      session.statements[0] ??
      null;
    return selected;
  }, [selectedStatementId, session]);
  const selectedEntity = useMemo(() => {
    if (!draft) {
      return null;
    }
    return draft.entities.find((entity) => entity.id === selectedEntityId) ?? draft.entities[0] ?? null;
  }, [draft, selectedEntityId]);

  useEffect(() => {
    if (!session) {
      void loadSample();
    }
  }, []);

  useEffect(() => {
    if (!draft) {
      setSelectedEntityId(null);
      return;
    }

    setSelectedEntityId((currentId) => {
      if (currentId && draft.entities.some((entity) => entity.id === currentId)) {
        return currentId;
      }
      return selectedReview?.statement.subject_entity_id ?? draft.entities[0]?.id ?? null;
    });
  }, [draft, selectedReview?.statement.subject_entity_id]);

  async function loadSample() {
    setLoading(true);
    setError(null);
    try {
      const nextSession = await createSampleDraft();
      setReviewSession(nextSession);
      setCommitted(null);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }

  async function generateDraft() {
    if (!prompt.trim()) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const nextSession = await createDraft(prompt.trim());
      setReviewSession(nextSession);
      setCommitted(null);
      setPrompt("");
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }

  async function applyDecision(status: ReviewStatus, text?: string) {
    if (!session || !selectedReview) {
      return;
    }
    setError(null);
    try {
      await reviewStatement(session.id, selectedReview.statement.id, status, text);
      setReviewSession(await getDraft(session.id));
      setCommitted(null);
    } catch (nextError) {
      setError(errorMessage(nextError));
    }
  }

  async function acceptAllPending() {
    if (!session) {
      return;
    }
    const pendingIds = session.statements
      .filter((review) => review.status === "pending")
      .map((review) => review.statement.id);
    if (pendingIds.length === 0) {
      return;
    }
    setError(null);
    try {
      setReviewSession(await bulkReview(session.id, "accepted", pendingIds));
      setCommitted(null);
    } catch (nextError) {
      setError(errorMessage(nextError));
    }
  }

  async function commitAccepted() {
    if (!session) {
      return;
    }
    setError(null);
    try {
      setCommitted(await commitDraft(session.id));
    } catch (nextError) {
      setError(errorMessage(nextError));
    }
  }

  async function renameEntity(entityId: string, label: string) {
    if (!session) {
      return;
    }
    setError(null);
    try {
      setReviewSession(await updateEntityLabel(session.id, entityId, label));
      setCommitted(null);
    } catch (nextError) {
      setError(errorMessage(nextError));
      throw nextError;
    }
  }

  async function addStatement(payload: StatementCreatePayload) {
    if (!session) {
      return;
    }
    setError(null);
    try {
      const nextSession = await createStatement(session.id, payload);
      setSession(nextSession);
      setSelectedStatementId(nextSession.statements.at(-1)?.statement.id ?? null);
      setCommitted(null);
    } catch (nextError) {
      setError(errorMessage(nextError));
      throw nextError;
    }
  }

  function selectStatement(statementId: string) {
    setSelectedStatementId(statementId);
    const statement = draft?.statements.find((candidate) => candidate.id === statementId);
    if (statement?.subject_entity_id) {
      setSelectedEntityId(statement.subject_entity_id);
    }
  }

  function selectEntity(entityId: Entity["id"]) {
    setSelectedEntityId(entityId);
  }

  function downloadJson() {
    const payload = committed?.ontology ?? draft;
    if (!payload) {
      return;
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug(payload.domain)}-ontology.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function setReviewSession(nextSession: DraftReviewSession) {
    setSession(nextSession);
    setSelectedStatementId((currentId) => {
      const statementIds = nextSession.statements.map((review) => review.statement.id);
      return currentId && statementIds.includes(currentId) ? currentId : statementIds[0] ?? null;
    });
  }

  const counts = session ? getReviewCounts(session.statements) : null;
  const acceptedCount = counts ? counts.accepted + counts.edited : 0;

  return (
    <main className="app-shell">
      <OntologyCanvas
        canCommit={acceptedCount > 0}
        draft={draft}
        error={error}
        loading={loading}
        onAcceptAll={acceptAllPending}
        onCommit={commitAccepted}
        onCreateStatement={addStatement}
        onDownload={downloadJson}
        onGenerate={generateDraft}
        onLoadSample={loadSample}
        onPromptChange={setPrompt}
        onRenameEntity={renameEntity}
        onSelectEntity={selectEntity}
        onSelectStatement={selectStatement}
        prompt={prompt}
        selectedEntityId={selectedEntity?.id ?? null}
        selectedStatementId={selectedReview?.statement.id ?? null}
        session={session}
      />
      <ReviewSidebar
        canCommit={acceptedCount > 0}
        committed={committed}
        error={error}
        loading={loading}
        onAcceptAll={acceptAllPending}
        onCommit={commitAccepted}
        onDecision={applyDecision}
        onDownload={downloadJson}
        onGenerate={generateDraft}
        onLoadSample={loadSample}
        onPromptChange={setPrompt}
        onSelectEntity={selectEntity}
        onSelectStatement={selectStatement}
        prompt={prompt}
        draft={draft}
        selectedEntity={selectedEntity}
        selectedReview={selectedReview}
        session={session}
      />
    </main>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ontology";
}
