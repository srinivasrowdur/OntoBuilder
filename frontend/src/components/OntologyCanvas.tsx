import { List, Menu, Network } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import {
  getReadinessReport,
  relationshipById,
  ruleById,
  ruleValuePhrase,
  statementStatus,
  stepStatementId,
} from "../ontology";
import type {
  DraftReviewSession,
  Entity,
  GenerationCounts,
  GenerationStep,
  NaturalLanguageStatement,
  OntologyDraft,
  ProjectSummary,
  ReviewStatus,
  StatementCreatePayload,
} from "../types";
import { CommandPalette } from "./CommandPalette";
import type { PaletteCommand } from "./CommandPalette";
import { FirstRunSuggestions } from "./FirstRunSuggestions";
import { GenerationProgress } from "./GenerationProgress";
import { NewStatementButton, StatementComposer } from "./StatementComposer";
import { OntologyPromptDock } from "./OntologyPromptDock";
import { ProjectDrawer } from "./ProjectDrawer";
import { ReadinessBar } from "./ReadinessBar";
import { RelationshipGraph } from "./RelationshipGraph";
import { renderStatementPart, renderStatementParts } from "./statementText";

interface OntologyCanvasProps {
  canCommit: boolean;
  draft: OntologyDraft | null;
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
  onReviewStatement: (statementId: string, status: ReviewStatus) => Promise<void> | void;
  onSelectEntity: (entityId: string) => void;
  onSelectStatement: (statementId: string) => void;
}

type CanvasView = "statements" | "graph";

export function OntologyCanvas({
  canCommit,
  draft,
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
  onReviewStatement,
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
  const entityKinds = useMemo(
    () => new Map(draft?.entities.map((entity) => [entity.id, entity.entity_type]) ?? []),
    [draft],
  );
  const pendingCount =
    session?.statements.filter((review) => review.status === "pending").length ?? 0;
  const blockingStatuses = new Set(["pending", "needs_clarification"]);
  const showWorklist = worklistOpen && readinessReport.blockingCount > 0;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const visibleStatements = useMemo(() => {
    const statements = draft?.statements ?? [];
    if (!showWorklist) {
      return statements;
    }
    return statements.filter((statement) =>
      blockingStatuses.has(statementStatus(session, statement)),
    );
    // blockingStatuses is a render-stable constant set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, session, showWorklist]);

  useEffect(() => {
    function handleGlobalKeyDown(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  // Keyboard navigation outruns React's re-render on key repeat, so the
  // handler reads and writes the live selection through a ref instead of
  // closing over the prop.
  const selectedStatementRef = useRef(selectedStatementId);

  useEffect(() => {
    selectedStatementRef.current = selectedStatementId;
  }, [selectedStatementId]);

  useEffect(() => {
    const decisionByKey: Record<string, ReviewStatus> = {
      a: "accepted",
      r: "rejected",
      c: "needs_clarification",
      p: "pending",
    };

    function isTypingTarget(target: EventTarget | null) {
      return (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      );
    }

    function handleTriageKeyDown(event: globalThis.KeyboardEvent) {
      if (!session || paletteOpen || isProjectDrawerOpen || isComposerOpen) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) {
        return;
      }
      const key = event.key.toLowerCase();
      const statementIds = visibleStatements.map((statement) => statement.id);
      const currentId = selectedStatementRef.current;

      if (key === "j" || key === "arrowdown" || key === "k" || key === "arrowup") {
        const delta = key === "j" || key === "arrowdown" ? 1 : -1;
        const nextId = stepStatementId(statementIds, currentId, delta);
        if (nextId) {
          event.preventDefault();
          selectedStatementRef.current = nextId;
          onSelectStatement(nextId);
        }
        return;
      }

      const decision = decisionByKey[key];
      if (decision && currentId && statementIds.includes(currentId)) {
        event.preventDefault();
        // Compute the auto-advance target before the decision removes the
        // row from a filtered worklist.
        const nextId = stepStatementId(statementIds, currentId, 1);
        void onReviewStatement(currentId, decision);
        if (nextId && nextId !== currentId) {
          selectedStatementRef.current = nextId;
          onSelectStatement(nextId);
        }
      }
    }

    window.addEventListener("keydown", handleTriageKeyDown);
    return () => window.removeEventListener("keydown", handleTriageKeyDown);
  }, [
    isComposerOpen,
    isProjectDrawerOpen,
    onReviewStatement,
    onSelectStatement,
    paletteOpen,
    session,
    visibleStatements,
  ]);

  useEffect(() => {
    if (canvasView !== "statements") {
      return;
    }
    document
      .querySelector(".statement-row.selected")
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [canvasView, selectedStatementId]);

  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    const commands: PaletteCommand[] = [
      {
        id: "new-ontology",
        title: "Create a new ontology",
        hint: "focus the prompt",
        action: () => {
          document.querySelector<HTMLTextAreaElement>(".prompt-compose textarea")?.focus();
        },
      },
      {
        id: "load-sample",
        title: "Load the retirements sample",
        hint: "works offline",
        action: () => onLoadSample(),
      },
    ];
    if (draft) {
      commands.push(
        {
          id: "view-text",
          title: "Switch to text view",
          action: () => setCanvasView("statements"),
        },
        {
          id: "view-graph",
          title: "Switch to graph view",
          action: () => setCanvasView("graph"),
        },
        {
          id: "download-json",
          title: "Download ontology JSON",
          action: () => onDownload(),
        },
      );
      if (readinessReport.blockingCount > 0) {
        commands.push({
          id: "worklist",
          title: `Show worklist (${readinessReport.blockingCount} need a decision)`,
          action: () => {
            setCanvasView("statements");
            setWorklistOpen(true);
          },
        });
      }
      if (pendingCount > 0) {
        commands.push({
          id: "accept-all",
          title: `Accept all pending statements (${pendingCount})`,
          action: () => onAcceptAll(),
        });
      }
      if (canCommit) {
        commands.push({
          id: "commit",
          title: `Commit ${readinessReport.committableCount} accepted statements`,
          action: () => onCommit(),
        });
      }
      if (selectedProjectId && session) {
        commands.push({
          id: "save-project",
          title: "Save project",
          action: () => void onProjectSave(),
        });
      }
    }
    for (const project of projects) {
      commands.push({
        id: `open-${project.id}`,
        title: `Open project: ${project.name}`,
        hint: project.domain ?? undefined,
        action: () => void onProjectOpen(project.id),
      });
    }
    return commands;
  }, [
    canCommit,
    draft,
    onAcceptAll,
    onCommit,
    onDownload,
    onLoadSample,
    onProjectOpen,
    onProjectSave,
    pendingCount,
    projects,
    readinessReport.blockingCount,
    readinessReport.committableCount,
    selectedProjectId,
    session,
  ]);

  const commandPalette = (
    <CommandPalette
      commands={paletteCommands}
      onClose={() => setPaletteOpen(false)}
      open={paletteOpen}
    />
  );

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
    return (
      <section className="ontology-panel empty-state">
        {commandPalette}
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
          {loading && !generationProgress ? (
            <div aria-label="Loading ontology" className="skeleton-list" role="status">
              {[0, 1, 2, 3, 4].map((row) => (
                <div className="skeleton-row" key={row}>
                  <span className="skeleton-bar skeleton-kicker" />
                  <span className={`skeleton-bar skeleton-line-${(row % 3) + 1}`} />
                </div>
              ))}
            </div>
          ) : null}
          {!isGenerating ? (
            <FirstRunSuggestions
              onGenerateExample={onGenerateExample}
              onLoadSample={onLoadSample}
              onProjectOpen={onProjectOpen}
              projects={projects}
            />
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="ontology-panel" aria-label="Ontology statements">
      {commandPalette}
      {projectDrawer}
      {projectMenuButton}
      <div
        className={`ontology-workspace-scroll${canvasView === "graph" ? " graph-mode" : ""}`}
        ref={workspaceScrollRef}
      >
        <ReadinessBar
          onToggleWorklist={() => {
            setCanvasView("statements");
            setWorklistOpen((open) => !open);
          }}
          report={readinessReport}
          showWorklist={showWorklist}
        />

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

                {visibleStatements.map((statement) => (
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
                            entityKinds,
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
