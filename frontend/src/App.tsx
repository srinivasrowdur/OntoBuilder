import { useEffect, useMemo, useState } from "react";
import {
  bulkReview,
  commitDraft,
  createDraft,
  createProject,
  createSampleDraft,
  createStatement,
  getDraft,
  listProjects,
  openProjectSession,
  reviewStatement,
  reviseProject,
  saveProject,
  streamDraft,
  updateEntityLabel,
} from "./api";
import { OntologyCanvas } from "./components/OntologyCanvas";
import { ReviewSidebar } from "./components/ReviewSidebar";
import { draftForDisplay, getReviewCounts } from "./ontology";
import {
  applyPreviewOverrides,
  extractPromptMentions,
  omitKey,
  setPreviewValue,
} from "./reviewState";
import type {
  CommitResponse,
  DraftReviewSession,
  DraftStreamEvent,
  Entity,
  GenerationCounts,
  GenerationStep,
  OntologyDraft,
  ProjectSummary,
  ReviewStatus,
  StatementCreatePayload,
} from "./types";

type InspectorMode = "entity" | "statement";

export function App() {
  const [session, setSession] = useState<DraftReviewSession | null>(null);
  const [selectedStatementId, setSelectedStatementId] = useState<string | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>("statement");
  const [entityLabelPreviews, setEntityLabelPreviews] = useState<Record<string, string>>({});
  const [statementTextPreviews, setStatementTextPreviews] = useState<Record<string, string>>({});
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<CommitResponse | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectMessage, setProjectMessage] = useState<string | null>(null);
  const [generationSteps, setGenerationSteps] = useState<GenerationStep[] | null>(null);
  const [generationStartedAt, setGenerationStartedAt] = useState(0);
  const [generationEntities, setGenerationEntities] = useState<string[]>([]);
  const [generationCounts, setGenerationCounts] = useState<GenerationCounts | null>(null);

  const baseDraft = useMemo(() => draftForDisplay(session), [session]);
  const draft = useMemo(
    () => applyPreviewOverrides(baseDraft, entityLabelPreviews, statementTextPreviews),
    [baseDraft, entityLabelPreviews, statementTextPreviews],
  );
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
    return (
      draft.entities.find((entity) => entity.id === selectedEntityId) ?? draft.entities[0] ?? null
    );
  }, [draft, selectedEntityId]);
  const selectedSavedEntity = useMemo(() => {
    if (!baseDraft) {
      return null;
    }
    return (
      baseDraft.entities.find((entity) => entity.id === selectedEntityId) ??
      baseDraft.entities[0] ??
      null
    );
  }, [baseDraft, selectedEntityId]);

  useEffect(() => {
    void refreshProjects();
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
    setProjectMessage(null);
    try {
      const nextSession = await createSampleDraft();
      setReviewSession(nextSession);
      setSelectedProjectId(null);
      setCommitted(null);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }

  async function generateDraft() {
    const requestText = prompt.trim();
    if (!requestText) {
      return;
    }
    setLoading(true);
    setError(null);
    setProjectMessage(null);
    setGenerationSteps([]);
    setGenerationStartedAt(Date.now());
    setGenerationEntities([]);
    setGenerationCounts(null);
    try {
      const nextSession = await streamDraft(requestText, (event) => {
        setGenerationSteps((current) => applyStreamEvent(current ?? [], event));
        if (event.type === "entity" && event.label) {
          const label = event.label;
          setGenerationEntities((current) =>
            current.includes(label) ? current : [...current, label],
          );
        }
        if (event.type === "counts") {
          setGenerationCounts({
            entities: event.entities ?? 0,
            relationships: event.relationships ?? 0,
            rules: event.rules ?? 0,
          });
        }
      }).catch(async (streamError) => {
        // Older backends have no stream route; fall back to the blocking endpoint.
        if (streamError instanceof Error && streamError.message.startsWith("API 404")) {
          return createDraft(requestText);
        }
        throw streamError;
      });
      setReviewSession(nextSession);
      setCommitted(null);
      setPrompt("");
      if (selectedProjectId) {
        const response = await saveProject(selectedProjectId, nextSession.id);
        setProjects((current) => upsertProject(current, response.project));
        setProjectMessage(`Project updated: ${response.project.name}`);
      } else {
        await createAndSaveProjectForSession(nextSession, requestText);
      }
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setLoading(false);
      setGenerationSteps(null);
      setGenerationEntities([]);
      setGenerationCounts(null);
    }
  }

  async function submitPrompt() {
    if (selectedProjectId && session) {
      await reviseActiveProject();
      return;
    }
    await generateDraft();
  }

  async function reviseActiveProject() {
    if (!session || !selectedProjectId) {
      return;
    }
    const instruction = prompt.trim();
    if (!instruction) {
      return;
    }
    setLoading(true);
    setError(null);
    setProjectMessage(null);
    try {
      const mentions = extractPromptMentions(instruction, session.draft.entities);
      const response = await reviseProject(selectedProjectId, session.id, instruction, mentions);
      setReviewSession(response.session);
      if (response.intent === "add_relationship" || response.intent === "add_rule") {
        setSelectedStatementId(response.session.statements.at(-1)?.statement.id ?? null);
      }
      if (response.intent === "expand_entity" && mentions[0]?.id) {
        setSelectedEntityId(mentions[0].id);
        setInspectorMode("entity");
      }
      setProjects((current) => upsertProject(current, response.project));
      setSelectedProjectId(response.project.id);
      setProjectMessage(response.message);
      setCommitted(null);
      setPrompt("");
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }

  async function updateStatementReview(statementId: string, status: ReviewStatus, text?: string) {
    if (!session) {
      return;
    }
    setError(null);
    try {
      await reviewStatement(session.id, statementId, status, text);
      setReviewSession(await getDraft(session.id));
      setStatementTextPreviews((current) => omitKey(current, statementId));
      setCommitted(null);
    } catch (nextError) {
      setError(errorMessage(nextError));
      throw nextError;
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
      setEntityLabelPreviews((current) => omitKey(current, entityId));
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

  async function refreshProjects() {
    try {
      const nextProjects = await listProjects();
      setProjects(nextProjects);
      setSelectedProjectId((currentId) => {
        if (currentId && nextProjects.some((project) => project.id === currentId)) {
          return currentId;
        }
        return null;
      });
    } catch (nextError) {
      setError(errorMessage(nextError));
    }
  }

  async function createWorkspaceProject(name: string, description?: string) {
    setProjectSaving(true);
    setError(null);
    setProjectMessage(null);
    try {
      const project = await createProject(name, description);
      setProjects((current) => upsertProject(current, project));
      setSelectedProjectId(project.id);
      setReviewSession(null);
      setCommitted(null);
      setPrompt("");
      setProjectMessage(`Project created: ${project.name}`);
    } catch (nextError) {
      setError(errorMessage(nextError));
      throw nextError;
    } finally {
      setProjectSaving(false);
    }
  }

  async function saveCurrentOntologyToProject() {
    if (!session || !selectedProjectId) {
      return;
    }
    setProjectSaving(true);
    setError(null);
    setProjectMessage(null);
    try {
      const response = await saveProject(selectedProjectId, session.id);
      setProjects((current) => upsertProject(current, response.project));
      setSelectedProjectId(response.project.id);
      setProjectMessage(`Saved ${response.project.name}`);
    } catch (nextError) {
      setError(errorMessage(nextError));
      throw nextError;
    } finally {
      setProjectSaving(false);
    }
  }

  async function openWorkspaceProject(projectId: string) {
    const project = projects.find((candidate) => candidate.id === projectId);
    setSelectedProjectId(projectId);
    setProjectMessage(null);
    if (!project?.draft_id) {
      setReviewSession(null);
      setCommitted(null);
      setPrompt("");
      if (project) {
        setProjectMessage(`Opened ${project.name}`);
      }
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const nextSession = await openProjectSession(projectId);
      setReviewSession(nextSession);
      setCommitted(null);
      setProjectMessage(`Opened ${project.name}`);
    } catch (nextError) {
      setError(errorMessage(nextError));
      throw nextError;
    } finally {
      setLoading(false);
    }
  }

  async function createAndSaveProjectForSession(
    nextSession: DraftReviewSession,
    description?: string,
  ) {
    setProjectSaving(true);
    const projectName = projectNameFromDraft(nextSession.draft);
    try {
      const project = await createProject(projectName, description);
      const response = await saveProject(project.id, nextSession.id);
      setProjects((current) => upsertProject(current, response.project));
      setSelectedProjectId(response.project.id);
      setProjectMessage(`Project created: ${response.project.name}`);
    } finally {
      setProjectSaving(false);
    }
  }

  function selectStatement(statementId: string) {
    setSelectedStatementId(statementId);
    setInspectorMode("statement");
    const statement = draft?.statements.find((candidate) => candidate.id === statementId);
    if (statement?.subject_entity_id) {
      setSelectedEntityId(statement.subject_entity_id);
    }
  }

  function selectEntity(entityId: Entity["id"]) {
    setSelectedEntityId(entityId);
    setInspectorMode("entity");
  }

  function previewEntityLabel(entityId: string, label: string | null) {
    setEntityLabelPreviews((current) => setPreviewValue(current, entityId, label));
  }

  function previewStatementText(statementId: string, text: string | null) {
    setStatementTextPreviews((current) => setPreviewValue(current, statementId, text));
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

  function setReviewSession(nextSession: DraftReviewSession | null) {
    setSession(nextSession);
    setEntityLabelPreviews({});
    setStatementTextPreviews({});
    if (!nextSession) {
      setSelectedEntityId(null);
      setSelectedStatementId(null);
      setInspectorMode("statement");
      return;
    }
    setSelectedStatementId((currentId) => {
      const statementIds = nextSession.statements.map((review) => review.statement.id);
      return currentId && statementIds.includes(currentId) ? currentId : (statementIds[0] ?? null);
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
        generationCounts={generationCounts}
        generationEntities={generationEntities}
        generationStartedAt={generationStartedAt}
        generationSteps={generationSteps}
        loading={loading}
        onAcceptAll={acceptAllPending}
        onCommit={commitAccepted}
        onCreateStatement={addStatement}
        onDownload={downloadJson}
        onGenerate={submitPrompt}
        onLoadSample={loadSample}
        onPromptChange={setPrompt}
        onProjectCreate={createWorkspaceProject}
        onProjectOpen={openWorkspaceProject}
        onProjectSave={saveCurrentOntologyToProject}
        onSelectEntity={selectEntity}
        onSelectStatement={selectStatement}
        prompt={prompt}
        projectMessage={projectMessage}
        projectSaving={projectSaving}
        projects={projects}
        selectedEntityId={selectedEntity?.id ?? null}
        selectedProjectId={selectedProjectId}
        selectedStatementId={selectedReview?.statement.id ?? null}
        session={session}
      />
      <ReviewSidebar
        draft={draft}
        inspectorMode={inspectorMode}
        onPreviewEntityLabel={previewEntityLabel}
        onPreviewStatementText={previewStatementText}
        onRenameEntity={renameEntity}
        onReviewStatement={updateStatementReview}
        onSelectEntity={selectEntity}
        onSelectStatement={selectStatement}
        selectedEntity={selectedEntity}
        selectedSavedEntity={selectedSavedEntity}
        selectedReview={selectedReview}
      />
    </main>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function applyStreamEvent(steps: GenerationStep[], event: DraftStreamEvent): GenerationStep[] {
  if (event.type === "stage" && event.stage) {
    const finished = steps.map((step) =>
      step.status === "active" ? { ...step, status: "done" as const } : step,
    );
    if (finished.some((step) => step.key === event.stage)) {
      return finished;
    }
    return [
      ...finished,
      { key: event.stage, label: event.message ?? event.stage, status: "active" },
    ];
  }
  if (event.type === "skill" && event.skill) {
    if (steps.some((step) => step.key === `skill:${event.skill}`)) {
      return steps;
    }
    return [
      ...steps,
      { key: `skill:${event.skill}`, label: event.label ?? event.skill, status: "done" },
    ];
  }
  return steps;
}

function slug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "ontology"
  );
}

function projectNameFromDraft(draft: OntologyDraft) {
  return titleCaseWords(draft.domain || draft.scope || "Ontology Project");
}

function titleCaseWords(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) =>
      word.length <= 3 && word === word.toUpperCase()
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ")
    .slice(0, 80);
}

function upsertProject(projects: ProjectSummary[], nextProject: ProjectSummary) {
  const existing = projects.filter((project) => project.id !== nextProject.id);
  return [nextProject, ...existing].sort((left, right) =>
    right.updated_at.localeCompare(left.updated_at),
  );
}
