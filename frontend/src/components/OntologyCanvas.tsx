import {
  Check,
  Download,
  FileJson,
  Folder,
  List,
  Loader2,
  Menu,
  Network,
  Save,
  Send,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import {
  getReadinessReport,
  relationshipById,
  ruleById,
  ruleValuePhrase,
  statementStatus,
} from "../ontology";
import type {
  DraftReviewSession,
  Entity,
  GenerationCounts,
  GenerationStep,
  NaturalLanguageStatement,
  OntologyDraft,
  ProjectSummary,
  StatementCreatePayload,
} from "../types";
import { escapeRegExp } from "../utils/text";
import { GenerationProgress } from "./GenerationProgress";
import { NewStatementButton, StatementComposer } from "./StatementComposer";
import { RelationshipGraph } from "./RelationshipGraph";

interface OntologyCanvasProps {
  canCommit: boolean;
  draft: OntologyDraft | null;
  error: string | null;
  generationCounts: GenerationCounts | null;
  generationEntities: string[];
  generationStartedAt: number;
  generationSteps: GenerationStep[] | null;
  hasCommitted: boolean;
  loading: boolean;
  prompt: string;
  projectMessage: string | null;
  projectSaving: boolean;
  projects: ProjectSummary[];
  selectedProjectId: string | null;
  session: DraftReviewSession | null;
  selectedEntityId: string | null;
  selectedStatementId: string | null;
  onAcceptAll: () => void;
  onCommit: () => void;
  onCreateStatement: (payload: StatementCreatePayload) => Promise<void>;
  onDownload: () => void;
  onGenerate: () => void;
  onGenerateExample: (text: string) => void;
  onLoadSample: () => void;
  onPromptChange: (prompt: string) => void;
  onProjectCreate: (name: string, description?: string) => Promise<void>;
  onProjectOpen: (projectId: string) => Promise<void>;
  onProjectSave: () => Promise<void>;
  onSelectEntity: (entityId: string) => void;
  onSelectStatement: (statementId: string) => void;
}

interface TextRange {
  start: number;
  end: number;
  label: string;
  kind: "entity" | "constraint";
  entityId?: string;
}

type CanvasView = "statements" | "graph";

const EXAMPLE_PROMPTS = [
  {
    title: "Pension schemes",
    prompt: "Build an ontology for workplace pension schemes",
  },
  {
    title: "Insurance claims",
    prompt: "Build an ontology for insurance claims handling",
  },
  {
    title: "Clinical referrals",
    prompt: "Build an ontology for hospital referrals focused on prior authorization",
  },
  {
    title: "Music festivals",
    prompt: "Build an ontology for organising music festivals",
  },
];

type StatementPart =
  | { kind: "text"; value: string }
  | { kind: "constraint"; value: string }
  | { kind: "entity"; value: string; entityId: string };

export function OntologyCanvas({
  canCommit,
  draft,
  error,
  generationCounts,
  generationEntities,
  generationStartedAt,
  generationSteps,
  hasCommitted,
  loading,
  onCreateStatement,
  onAcceptAll,
  onCommit,
  onDownload,
  onGenerate,
  onGenerateExample,
  onLoadSample,
  onPromptChange,
  onProjectCreate,
  onProjectOpen,
  onProjectSave,
  onSelectEntity,
  prompt,
  projectMessage,
  projectSaving,
  projects,
  session,
  selectedEntityId,
  selectedProjectId,
  selectedStatementId,
  onSelectStatement,
}: OntologyCanvasProps) {
  const readinessReport = getReadinessReport(session);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [canvasView, setCanvasView] = useState<CanvasView>("statements");
  const [isProjectDrawerOpen, setIsProjectDrawerOpen] = useState(false);
  const [worklistOpen, setWorklistOpen] = useState(false);
  const workspaceScrollRef = useRef<HTMLDivElement | null>(null);
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const entityLabels = useMemo(
    () => new Map(draft?.entities.map((entity) => [entity.id, entity.label]) ?? []),
    [draft],
  );
  const pendingCount =
    session?.statements.filter((review) => review.status === "pending").length ?? 0;
  const blockingStatuses = new Set(["pending", "needs_clarification"]);
  const showWorklist = worklistOpen && readinessReport.blockingCount > 0;

  function handlePromptSubmit(event: FormEvent) {
    event.preventDefault();
    onGenerate();
  }

  const projectDrawer = isProjectDrawerOpen ? (
    <ProjectDrawer
      canSave={Boolean(session && selectedProjectId)}
      message={projectMessage}
      onClose={() => setIsProjectDrawerOpen(false)}
      onCreateProject={onProjectCreate}
      onOpenProject={onProjectOpen}
      onSaveProject={onProjectSave}
      projects={projects}
      saving={projectSaving}
      selectedProjectId={selectedProjectId}
    />
  ) : null;

  const projectMenuButton = (
    <button
      aria-label="Projects"
      className="canvas-menu-button"
      onClick={() => setIsProjectDrawerOpen(true)}
      type="button"
    >
      <Menu size={18} />
    </button>
  );

  const generationProgress =
    generationSteps && generationSteps.length > 0 ? (
      <GenerationProgress
        counts={generationCounts}
        entities={generationEntities}
        startedAt={generationStartedAt}
        steps={generationSteps}
      />
    ) : null;

  if (!draft) {
    const isGenerating = Boolean(generationProgress) || loading;
    const recentProjects = projects.filter((project) => project.draft_id).slice(0, 3);
    return (
      <section className="ontology-panel empty-state">
        {projectDrawer}
        {projectMenuButton}
        <div className="empty-canvas-center">
          {selectedProject ? <h1 className="empty-project-name">{selectedProject.name}</h1> : null}
          {!selectedProject && !isGenerating ? (
            <div className="first-run-intro">
              <h1>What should we model?</h1>
              <p>
                Describe a domain and OntoBuilder drafts an ontology you can review as plain
                English, refine, and export as JSON.
              </p>
            </div>
          ) : null}
          <OntologyPromptDock
            canCommit={false}
            canDownload={false}
            entities={[]}
            error={error}
            loading={loading}
            onAcceptAll={onAcceptAll}
            onCommit={onCommit}
            onDownload={onDownload}
            onGenerate={onGenerate}
            onLoadSample={onLoadSample}
            onPromptChange={onPromptChange}
            pendingCount={0}
            placement="center"
            prompt={prompt}
            onSubmit={handlePromptSubmit}
          />
          {generationProgress}
          {!isGenerating ? (
            <div className="first-run-suggestions">
              <div className="example-prompts" aria-label="Example ontologies">
                {EXAMPLE_PROMPTS.map((example) => (
                  <button
                    key={example.title}
                    onClick={() => onGenerateExample(example.prompt)}
                    type="button"
                  >
                    <strong>{example.title}</strong>
                    <span>{example.prompt}</span>
                  </button>
                ))}
              </div>
              <div className="first-run-secondary">
                <button className="first-run-sample" onClick={onLoadSample} type="button">
                  <Upload size={14} />
                  Load the retirements sample — no API key needed
                </button>
                {recentProjects.length > 0 ? (
                  <div className="first-run-recents" aria-label="Recent projects">
                    <span>Recent:</span>
                    {recentProjects.map((project) => (
                      <button
                        key={project.id}
                        onClick={() => void onProjectOpen(project.id)}
                        type="button"
                      >
                        <Folder size={13} />
                        {project.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="ontology-panel" aria-label="Ontology statements">
      {projectDrawer}
      {projectMenuButton}
      <div
        className={`ontology-workspace-scroll${canvasView === "graph" ? " graph-mode" : ""}`}
        ref={workspaceScrollRef}
      >
        <div className="readiness-bar" aria-label="Review progress">
          <div className="readiness-progress">
            <span className="readiness-track" aria-hidden="true">
              <span className="readiness-fill" style={{ width: `${readinessReport.readiness}%` }} />
            </span>
            <span className="readiness-summary">
              <strong>{readinessReport.decidedCount}</strong> of{" "}
              <strong>{readinessReport.totalCount}</strong> reviewed
            </span>
          </div>
          <div className="readiness-stages" aria-label="Workflow stage">
            {(["review", "resolve", "export"] as const).map((stage) => (
              <span
                className={`readiness-stage${readinessReport.stage === stage ? " active" : ""}`}
                key={stage}
              >
                {stage === "review" ? "Review" : stage === "resolve" ? "Resolve" : "Export"}
              </span>
            ))}
          </div>
          {readinessReport.blockingCount > 0 ? (
            <button
              className={`readiness-worklist-toggle${showWorklist ? " active" : ""}`}
              onClick={() => {
                setCanvasView("statements");
                setWorklistOpen((open) => !open);
              }}
              type="button"
            >
              {showWorklist
                ? "Show all statements"
                : `${readinessReport.blockingCount} need a decision`}
            </button>
          ) : (
            <span className="readiness-ready">Ready to commit</span>
          )}
        </div>

        <div className="domain-title">
          <div className="domain-copy">
            <span>{draft.domain}</span>
            <small>{draft.scope ?? "general ontology"}</small>
          </div>
          <div className="domain-actions">
            <div className="view-toggle" aria-label="Canvas view">
              <button
                className={canvasView === "statements" ? "active" : ""}
                onClick={() => setCanvasView("statements")}
                type="button"
              >
                <List size={15} />
                Text
              </button>
              <button
                className={canvasView === "graph" ? "active" : ""}
                onClick={() => {
                  setIsComposerOpen(false);
                  setCanvasView("graph");
                  workspaceScrollRef.current?.scrollTo({ top: 0 });
                }}
                type="button"
              >
                <Network size={15} />
                Graph
              </button>
            </div>
            <NewStatementButton
              onClick={() => {
                setCanvasView("statements");
                setIsComposerOpen(true);
              }}
            />
          </div>
        </div>

        <div className="flip-stage">
          <div className="flip-view" key={canvasView}>
            {canvasView === "statements" ? (
              <div className="statement-list">
                {isComposerOpen ? (
                  <StatementComposer
                    draft={draft}
                    onCancel={() => setIsComposerOpen(false)}
                    onCreateStatement={onCreateStatement}
                  />
                ) : null}

                {showWorklist ? (
                  <div className="worklist-banner" role="status">
                    <strong>
                      Worklist · {readinessReport.blockingCount} statement
                      {readinessReport.blockingCount === 1 ? "" : "s"} need a decision
                    </strong>
                    <span>
                      Accept, edit, or reject each one below. Rejected statements are left out of
                      the committed ontology.
                    </span>
                    {readinessReport.openQuestions.length > 0 ? (
                      <ul className="worklist-questions">
                        {readinessReport.openQuestions.map((question) => (
                          <li key={question}>{question}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                {draft.statements
                  .filter(
                    (statement) =>
                      !showWorklist || blockingStatuses.has(statementStatus(session, statement)),
                  )
                  .map((statement) => (
                    <div
                      className={[
                        "statement-row",
                        `statement-${statement.kind}`,
                        selectedStatementId === statement.id ? "selected" : "",
                        statementStatus(session, statement),
                      ].join(" ")}
                      key={statement.id}
                      onClick={() => onSelectStatement(statement.id)}
                    >
                      <span className="statement-status" aria-hidden="true" />
                      <span className="statement-body">
                        <span className={`statement-kind ${statement.kind}`}>
                          {statement.kind === "rule" ? "Rule" : "Relationship"}
                        </span>
                        <span className="statement">
                          {renderStatementParts(statement, draft).map((part, index) =>
                            renderStatementPart({
                              entityLabels,
                              index,
                              onSelectEntity,
                              onSelectStatement,
                              part,
                              selectedEntityId,
                              statement,
                            }),
                          )}
                        </span>
                        {showWorklist ? (
                          <span className="worklist-reason">
                            {statementStatus(session, statement) === "needs_clarification"
                              ? "marked for clarification"
                              : "awaiting review"}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
              <RelationshipGraph
                draft={draft}
                onSelectEntity={onSelectEntity}
                onSelectStatement={onSelectStatement}
                onShowTextView={() => setCanvasView("statements")}
                selectedEntityId={selectedEntityId}
                selectedStatementId={selectedStatementId}
              />
            )}
          </div>
        </div>

        <div className="stats-row" aria-label="Ontology statistics">
          <span>{draft.entities.length} entities</span>
          <span>{draft.relationships.length} relationships</span>
          <span>{draft.rules.length} rules</span>
          <span>{draft.statements.length} statements</span>
        </div>
      </div>
      {generationProgress}
      <OntologyPromptDock
        canCommit={canCommit}
        canDownload={Boolean(draft)}
        commitEmphasis={readinessReport.stage === "export" && canCommit && !hasCommitted}
        committableCount={readinessReport.committableCount}
        downloadEmphasis={hasCommitted}
        error={error}
        entities={draft.entities}
        loading={loading}
        onAcceptAll={onAcceptAll}
        onCommit={onCommit}
        onDownload={onDownload}
        onGenerate={onGenerate}
        onLoadSample={onLoadSample}
        onPromptChange={onPromptChange}
        pendingCount={pendingCount}
        placement="bottom"
        prompt={prompt}
        onSubmit={handlePromptSubmit}
      />
    </section>
  );
}

function ProjectDrawer({
  canSave,
  message,
  onClose,
  onCreateProject,
  onOpenProject,
  onSaveProject,
  projects,
  saving,
  selectedProjectId,
}: {
  canSave: boolean;
  message: string | null;
  onClose: () => void;
  onCreateProject: (name: string, description?: string) => Promise<void>;
  onOpenProject: (projectId: string) => Promise<void>;
  onSaveProject: () => Promise<void>;
  projects: ProjectSummary[];
  saving: boolean;
  selectedProjectId: string | null;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function handleCreateProject(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || saving) {
      return;
    }
    try {
      await onCreateProject(trimmedName, description.trim() || undefined);
      setName("");
      setDescription("");
      setIsCreating(false);
    } catch {
      // Global app error state owns the rendered failure message.
    }
  }

  async function handleSaveProject() {
    try {
      await onSaveProject();
    } catch {
      // Global app error state owns the rendered failure message.
    }
  }

  async function handleOpenProject(projectId: string) {
    try {
      await onOpenProject(projectId);
      onClose();
    } catch {
      // Global app error state owns the rendered failure message.
    }
  }

  return (
    <div className="project-drawer-shell" role="presentation">
      <button
        aria-label="Close projects"
        className="project-drawer-scrim"
        onClick={onClose}
        type="button"
      />
      <aside className="project-drawer" aria-label="Projects">
        <div className="project-drawer-header">
          <div>
            <span>Workspace</span>
            <strong>Projects</strong>
          </div>
          <button aria-label="Close projects" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>

        <div className="project-drawer-actions">
          <button
            disabled={saving}
            onClick={() => setIsCreating((current) => !current)}
            type="button"
          >
            <Folder size={15} />
            New Project
          </button>
          <button
            disabled={!canSave || saving}
            onClick={() => void handleSaveProject()}
            type="button"
          >
            {saving ? <Loader2 className="spin" size={15} /> : <Save size={15} />}
            Save Current
          </button>
        </div>

        {isCreating ? (
          <form className="project-create-form" onSubmit={handleCreateProject}>
            <input
              aria-label="Project name"
              onChange={(event) => setName(event.target.value)}
              placeholder="Project name"
              value={name}
            />
            <input
              aria-label="Project description"
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Description"
              value={description}
            />
            <button disabled={!name.trim() || saving} type="submit">
              <Check size={14} />
              Create
            </button>
          </form>
        ) : null}

        {message ? <p className="project-message">{message}</p> : null}

        <div className="project-list" aria-label="Saved projects">
          {projects.length === 0 ? (
            <p>No projects yet.</p>
          ) : (
            projects.map((project) => (
              <button
                className={selectedProjectId === project.id ? "active" : ""}
                key={project.id}
                onClick={() => void handleOpenProject(project.id)}
                type="button"
              >
                <strong>{project.name}</strong>
                <span>{project.domain ?? "No ontology saved"}</span>
                <small>
                  {project.statement_count > 0
                    ? `${project.entity_count} entities · ${project.statement_count} statements`
                    : "Empty project"}
                </small>
              </button>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}

function OntologyPromptDock({
  canCommit,
  canDownload,
  commitEmphasis = false,
  committableCount = 0,
  downloadEmphasis = false,
  entities,
  error,
  loading,
  onAcceptAll,
  onCommit,
  onDownload,
  onGenerate,
  onLoadSample,
  onPromptChange,
  onSubmit,
  pendingCount,
  placement = "bottom",
  prompt,
}: {
  canCommit: boolean;
  canDownload: boolean;
  commitEmphasis?: boolean;
  committableCount?: number;
  downloadEmphasis?: boolean;
  entities: Entity[];
  error: string | null;
  loading: boolean;
  onAcceptAll: () => void;
  onCommit: () => void;
  onDownload: () => void;
  onGenerate: () => void;
  onLoadSample: () => void;
  onPromptChange: (prompt: string) => void;
  onSubmit: (event: FormEvent) => void;
  pendingCount: number;
  placement?: "bottom" | "center";
  prompt: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [caretIndex, setCaretIndex] = useState(0);
  const [activeOptionIndex, setActiveOptionIndex] = useState(0);
  const activeMention = useMemo(() => getActiveMention(prompt, caretIndex), [caretIndex, prompt]);
  const mentionOptions = useMemo(
    () => mentionEntityOptions(entities, activeMention?.query ?? ""),
    [activeMention?.query, entities],
  );
  const showMentionOptions = Boolean(activeMention && mentionOptions.length > 0);

  useEffect(() => {
    setActiveOptionIndex(0);
  }, [activeMention?.query, mentionOptions.length]);

  function updateCaretFromTextarea(textarea: HTMLTextAreaElement) {
    setCaretIndex(textarea.selectionStart);
  }

  function selectMention(entity: Entity) {
    if (!activeMention) {
      return;
    }
    const token = `@${entity.label}`;
    const nextPrompt = `${prompt.slice(0, activeMention.start)}${token}${prompt.slice(activeMention.end)}`;
    const nextCaret = activeMention.start + token.length;
    onPromptChange(nextPrompt);
    setCaretIndex(nextCaret);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      onGenerate();
      return;
    }

    if (!showMentionOptions) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveOptionIndex((current) => (current + 1) % mentionOptions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveOptionIndex((current) => (current === 0 ? mentionOptions.length - 1 : current - 1));
      return;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      selectMention(mentionOptions[activeOptionIndex] ?? mentionOptions[0]);
    }
  }

  return (
    <form className={`ontology-prompt-dock ${placement}`} onSubmit={onSubmit}>
      {placement === "bottom" ? (
        <div className="dock-actions" aria-label="Ontology actions">
          <button onClick={onLoadSample} type="button">
            <Upload size={15} />
            Sample
          </button>
          <button
            className={downloadEmphasis ? "dock-primary" : ""}
            disabled={!canDownload}
            onClick={onDownload}
            type="button"
          >
            <Download size={15} />
            {downloadEmphasis ? "Download JSON" : "JSON"}
          </button>
          <button disabled={pendingCount === 0} onClick={onAcceptAll} type="button">
            <Check size={15} />
            Accept {pendingCount}
          </button>
          <button
            className={commitEmphasis ? "dock-primary" : ""}
            disabled={!canCommit}
            onClick={onCommit}
            title={canCommit ? undefined : "Accept or edit at least one statement first"}
            type="button"
          >
            <FileJson size={15} />
            Commit{committableCount > 0 ? ` ${committableCount}` : ""}
          </button>
        </div>
      ) : null}

      {error ? <div className="dock-error">{error}</div> : null}

      <div className="prompt-compose">
        {showMentionOptions ? (
          <div className="mention-menu" role="listbox">
            {mentionOptions.map((entity, index) => (
              <button
                className={index === activeOptionIndex ? "active" : ""}
                key={entity.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectMention(entity)}
                role="option"
                type="button"
              >
                <span>{entity.label}</span>
                <small>{entity.entity_type.replace(/_/g, " ")}</small>
              </button>
            ))}
          </div>
        ) : null}
        <textarea
          aria-label="Create ontology"
          onBlur={(event) => updateCaretFromTextarea(event.currentTarget)}
          onChange={(event) => {
            onPromptChange(event.target.value);
            updateCaretFromTextarea(event.currentTarget);
          }}
          onClick={(event) => updateCaretFromTextarea(event.currentTarget)}
          onKeyDown={handleKeyDown}
          onKeyUp={(event) => updateCaretFromTextarea(event.currentTarget)}
          placeholder={
            placement === "center"
              ? "Describe the ontology to create"
              : "Revise this ontology with @Entity mentions"
          }
          ref={textareaRef}
          value={prompt}
        />
        <button
          aria-label="Generate ontology"
          className="send-button"
          disabled={loading || !prompt.trim()}
          type="submit"
        >
          {loading ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
        </button>
      </div>
    </form>
  );
}

function getActiveMention(
  value: string,
  caretIndex: number,
): { end: number; query: string; start: number } | null {
  const beforeCaret = value.slice(0, caretIndex);
  const mentionStart = beforeCaret.lastIndexOf("@");
  if (mentionStart < 0) {
    return null;
  }
  const query = beforeCaret.slice(mentionStart + 1);
  if (/[\n.,;:()[\]{}]/.test(query) || query.length > 48) {
    return null;
  }
  return { end: caretIndex, query, start: mentionStart };
}

function mentionEntityOptions(entities: Entity[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (entities.length === 0) {
    return [];
  }
  if (
    normalizedQuery &&
    entities.some(
      (entity) =>
        entity.label.toLowerCase() === normalizedQuery ||
        entity.id.toLowerCase() === normalizedQuery,
    )
  ) {
    return [];
  }

  return entities
    .filter((entity) => {
      if (!normalizedQuery) {
        return true;
      }
      return (
        entity.label.toLowerCase().includes(normalizedQuery) ||
        entity.id.toLowerCase().includes(normalizedQuery) ||
        entity.aliases.some((alias) => alias.toLowerCase().includes(normalizedQuery))
      );
    })
    .sort((left, right) => {
      if (!normalizedQuery) {
        return left.label.localeCompare(right.label);
      }
      const leftStarts = left.label.toLowerCase().startsWith(normalizedQuery);
      const rightStarts = right.label.toLowerCase().startsWith(normalizedQuery);
      if (leftStarts !== rightStarts) {
        return leftStarts ? -1 : 1;
      }
      return left.label.localeCompare(right.label);
    })
    .slice(0, 7);
}

function renderStatementPart({
  entityLabels,
  index,
  onSelectEntity,
  onSelectStatement,
  part,
  selectedEntityId,
  statement,
}: {
  entityLabels: Map<string, string>;
  index: number;
  onSelectEntity: (entityId: string) => void;
  onSelectStatement: (statementId: string) => void;
  part: StatementPart;
  selectedEntityId: string | null;
  statement: NaturalLanguageStatement;
}) {
  const key = `${statement.id}-${index}`;

  if (part.kind === "text") {
    return <span key={key}>{part.value}</span>;
  }

  if (part.kind === "constraint") {
    return (
      <span className="chip constraint" key={key}>
        {part.value}
      </span>
    );
  }

  return (
    <button
      aria-label={`Inspect entity ${entityLabels.get(part.entityId) ?? part.value}`}
      className={[
        "chip entity entity-chip",
        selectedEntityId === part.entityId ? "selected-entity" : "",
      ].join(" ")}
      key={key}
      onClick={(event) => {
        event.stopPropagation();
        onSelectStatement(statement.id);
        onSelectEntity(part.entityId);
      }}
      title="Inspect entity"
      type="button"
    >
      {part.value}
    </button>
  );
}

function renderStatementParts(
  statement: NaturalLanguageStatement,
  draft: OntologyDraft,
): StatementPart[] {
  const entityLabels = new Map(draft.entities.map((entity) => [entity.id, entity.label]));
  const ranges: TextRange[] = [];

  if (statement.kind === "relationship") {
    const relationship = relationshipById(draft, statement.relationship_id);
    if (relationship) {
      addEntityRange(
        ranges,
        statement.text,
        entityLabels.get(relationship.subject_entity_id),
        relationship.subject_entity_id,
      );
      addEntityRange(
        ranges,
        statement.text,
        entityLabels.get(relationship.object_entity_id),
        relationship.object_entity_id,
      );
    }
  }

  if (statement.kind === "rule") {
    const rule = ruleById(draft, statement.rule_id);
    if (rule) {
      addEntityRange(
        ranges,
        statement.text,
        entityLabels.get(rule.applies_to_entity_id),
        rule.applies_to_entity_id,
      );
      if (rule.value_entity_id) {
        addEntityRange(
          ranges,
          statement.text,
          entityLabels.get(rule.value_entity_id),
          rule.value_entity_id,
        );
      }
      const valuePhrase = ruleValuePhrase(rule);
      if (valuePhrase) {
        addLiteralRange(ranges, statement.text, valuePhrase, "constraint");
      }
    }
  }

  return splitTextWithRanges(statement.text, ranges);
}

function addEntityRange(
  ranges: TextRange[],
  text: string,
  label: string | undefined,
  entityId: string,
) {
  if (!label) {
    return;
  }
  const match = new RegExp(`\\b${escapeRegExp(label)}s?\\b`, "i").exec(text);
  if (!match) {
    return;
  }
  addRange(ranges, match.index, match.index + match[0].length, match[0], "entity", entityId);
}

function addLiteralRange(
  ranges: TextRange[],
  text: string,
  phrase: string,
  kind: TextRange["kind"],
) {
  const index = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (index >= 0) {
    addRange(ranges, index, index + phrase.length, text.slice(index, index + phrase.length), kind);
  }
}

function addRange(
  ranges: TextRange[],
  start: number,
  end: number,
  label: string,
  kind: TextRange["kind"],
  entityId?: string,
) {
  const overlaps = ranges.some((range) => !(end <= range.start || start >= range.end));
  if (!overlaps) {
    ranges.push({ start, end, label, kind, entityId });
  }
}

function splitTextWithRanges(text: string, ranges: TextRange[]): StatementPart[] {
  if (ranges.length === 0) {
    return [{ kind: "text", value: text }];
  }

  const sortedRanges = [...ranges].sort((a, b) => a.start - b.start);
  const parts: StatementPart[] = [];
  let cursor = 0;

  for (const range of sortedRanges) {
    if (range.start > cursor) {
      parts.push({ kind: "text", value: text.slice(cursor, range.start) });
    }
    if (range.kind === "entity" && range.entityId) {
      parts.push({ kind: range.kind, value: range.label, entityId: range.entityId });
    } else {
      parts.push({ kind: "constraint", value: range.label });
    }
    cursor = range.end;
  }

  if (cursor < text.length) {
    parts.push({ kind: "text", value: text.slice(cursor) });
  }

  return parts;
}
