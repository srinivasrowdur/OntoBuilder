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
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, MouseEvent } from "react";
import type {
  GraphCanvasRef,
  GraphEdge,
  GraphNode,
  InternalGraphEdge,
  InternalGraphNode,
  InternalGraphPosition,
  LayoutOverrides,
  Theme,
} from "reagraph";
import {
  getReadiness,
  relationshipById,
  ruleById,
  ruleValuePhrase,
  statementStatus,
} from "../ontology";
import type {
  DraftReviewSession,
  Entity,
  NaturalLanguageStatement,
  OntologyDraft,
  ProjectSummary,
  Relationship,
  StatementCreatePayload,
} from "../types";
import { NewStatementButton, StatementComposer } from "./StatementComposer";

interface OntologyCanvasProps {
  canCommit: boolean;
  draft: OntologyDraft | null;
  error: string | null;
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

type StatementPart =
  | { kind: "text"; value: string }
  | { kind: "constraint"; value: string }
  | { kind: "entity"; value: string; entityId: string };

interface OntologyGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  degreeByEntityId: Map<string, number>;
  positionsByEntityId: Map<string, GraphPosition>;
  relationshipById: Map<string, Relationship>;
}

interface GraphPosition extends Pick<InternalGraphPosition, "x" | "y" | "z"> {}

const ReagraphCanvas = lazy(async () => {
  const module = await import("reagraph");
  return { default: module.GraphCanvas };
});

const ONTOLOGY_GRAPH_THEME: Theme = {
  canvas: {
    background: "#050816",
    fog: "#050816",
  },
  node: {
    fill: "#24486f",
    activeFill: "#eec05b",
    opacity: 1,
    selectedOpacity: 1,
    inactiveOpacity: 0.42,
    label: {
      activeColor: "#f8d488",
      backgroundColor: "#08101f",
      backgroundOpacity: 0.72,
      color: "#d8e7ff",
      radius: 5,
      stroke: "#050816",
    },
    subLabel: {
      activeColor: "#f8d488",
      color: "#95a6bd",
      stroke: "#050816",
    },
  },
  ring: {
    activeFill: "#eec05b",
    fill: "#5b8fe7",
  },
  edge: {
    activeFill: "#f8d488",
    fill: "#7fa0d5",
    opacity: 1,
    selectedOpacity: 1,
    inactiveOpacity: 0.28,
    label: {
      activeColor: "#f8d488",
      color: "#f1cf86",
      fontSize: 7,
      stroke: "#050816",
    },
    subLabel: {
      activeColor: "#f8d488",
      color: "#9ca9bd",
      fontSize: 5,
      stroke: "#050816",
    },
  },
  arrow: {
    activeFill: "#f8d488",
    fill: "#7fa0d5",
  },
  lasso: {
    background: "rgba(91, 143, 231, 0.16)",
    border: "1px solid rgba(123, 169, 244, 0.75)",
  },
  cluster: {
    fill: "#152238",
    opacity: 0.68,
    selectedOpacity: 0.9,
    stroke: "#344765",
    inactiveOpacity: 0.12,
    label: {
      color: "#b9c4d8",
      fontSize: 7,
      stroke: "#050816",
    },
  },
};

export function OntologyCanvas({
  canCommit,
  draft,
  error,
  loading,
  onCreateStatement,
  onAcceptAll,
  onCommit,
  onDownload,
  onGenerate,
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
  const { readiness, blockingIssues } = getReadiness(draft);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [canvasView, setCanvasView] = useState<CanvasView>("statements");
  const [isProjectDrawerOpen, setIsProjectDrawerOpen] = useState(false);
  const workspaceScrollRef = useRef<HTMLDivElement | null>(null);
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const entityLabels = useMemo(
    () => new Map(draft?.entities.map((entity) => [entity.id, entity.label]) ?? []),
    [draft],
  );
  const pendingCount = session?.statements.filter((review) => review.status === "pending").length ?? 0;

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

  if (!draft) {
    return (
      <section className="ontology-panel empty-state">
        {projectDrawer}
        {projectMenuButton}
        <div className="empty-canvas-center">
          {selectedProject ? (
            <h1 className="empty-project-name">{selectedProject.name}</h1>
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
        </div>
      </section>
    );
  }

  return (
    <section className="ontology-panel" aria-label="Ontology statements">
      {projectDrawer}
      {projectMenuButton}
      <div className="ontology-workspace-scroll" ref={workspaceScrollRef}>
        <div className="status-line">
          <span>
            Export readiness <strong>{readiness}%</strong>
          </span>
          <span className="dot">·</span>
          <span className="issue">{blockingIssues} blocking issues</span>
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

                {draft.statements.map((statement) => (
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
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <RelationshipGraph
                draft={draft}
                onSelectEntity={onSelectEntity}
                onSelectStatement={onSelectStatement}
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
      <OntologyPromptDock
        canCommit={canCommit}
        canDownload={Boolean(draft)}
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
      <button aria-label="Close projects" className="project-drawer-scrim" onClick={onClose} type="button" />
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
  const activeMention = useMemo(
    () => getActiveMention(prompt, caretIndex),
    [caretIndex, prompt],
  );
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
      setActiveOptionIndex((current) =>
        current === 0 ? mentionOptions.length - 1 : current - 1,
      );
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
          <button disabled={!canDownload} onClick={onDownload} type="button">
            <Download size={15} />
            JSON
          </button>
          <button disabled={pendingCount === 0} onClick={onAcceptAll} type="button">
            <Check size={15} />
            Accept {pendingCount}
          </button>
          <button disabled={!canCommit} onClick={onCommit} type="button">
            <FileJson size={15} />
            Commit
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

function RelationshipGraph({
  draft,
  onSelectEntity,
  onSelectStatement,
  selectedEntityId,
  selectedStatementId,
}: {
  draft: OntologyDraft;
  onSelectEntity: (entityId: string) => void;
  onSelectStatement: (statementId: string) => void;
  selectedEntityId: string | null;
  selectedStatementId: string | null;
}) {
  const graphRef = useRef<GraphCanvasRef | null>(null);
  const graphMapRef = useRef<HTMLDivElement | null>(null);
  const statementByRelationshipId = useMemo(() => {
    const statements = new Map<string, NaturalLanguageStatement>();
    for (const statement of draft.statements) {
      if (statement.kind === "relationship" && statement.relationship_id) {
        statements.set(statement.relationship_id, statement);
      }
    }
    return statements;
  }, [draft.statements]);
  const statementByEntityId = useMemo(() => {
    const statements = new Map<string, NaturalLanguageStatement>();
    for (const statement of draft.statements) {
      if (statement.kind !== "relationship") {
        continue;
      }
      if (!statements.has(statement.subject_entity_id)) {
        statements.set(statement.subject_entity_id, statement);
      }
      if (statement.object_entity_id && !statements.has(statement.object_entity_id)) {
        statements.set(statement.object_entity_id, statement);
      }
    }
    return statements;
  }, [draft.statements]);
  const graph = useMemo(() => buildOntologyGraphData(draft), [draft]);
  const graphRenderKey = useMemo(
    () =>
      [
        graph.nodes.map((node) => node.id).join("|"),
        graph.edges.map((edge) => edge.id).join("|"),
      ].join("::"),
    [graph.edges, graph.nodes],
  );
  const fitGraphToView = useCallback(() => {
    if (graph.nodes.length === 0) {
      return;
    }
    graphRef.current?.fitNodesInView(undefined, { animated: false });
  }, [graph.nodes.length]);
  const layoutOverrides = useMemo(
    () =>
      ({
        getNodePosition: (id: string) =>
          graph.positionsByEntityId.get(id) ?? { x: 0, y: 0, z: 0 },
      }) as unknown as LayoutOverrides,
    [graph.positionsByEntityId],
  );
  const selectedRelationshipId = useMemo(() => {
    const selectedStatement = draft.statements.find((statement) => statement.id === selectedStatementId);
    return selectedStatement?.kind === "relationship" ? selectedStatement.relationship_id : null;
  }, [draft.statements, selectedStatementId]);
  const selectedStatement = draft.statements.find((statement) => statement.id === selectedStatementId);
  const selectedRelationship = selectedRelationshipId
    ? graph.relationshipById.get(selectedRelationshipId)
    : null;
  const selectedIds = useMemo(
    () => {
      if (selectedRelationship) {
        return [
          selectedRelationship.id,
          selectedRelationship.subject_entity_id,
          selectedRelationship.object_entity_id,
        ];
      }

      const selectedEntityIds = [selectedEntityId, selectedStatement?.subject_entity_id].filter(
        (entityId): entityId is string => Boolean(entityId),
      );
      return [...new Set(selectedEntityIds)];
    },
    [selectedEntityId, selectedRelationship, selectedStatement],
  );

  useEffect(() => {
    let cancelled = false;
    const timeoutIds = [700, 1200, 1800].map((delay) =>
      window.setTimeout(() => {
        if (!cancelled) {
          fitGraphToView();
        }
      }, delay),
    );

    return () => {
      cancelled = true;
      timeoutIds.forEach(window.clearTimeout);
    };
  }, [fitGraphToView, graph.edges.length, graph.nodes.length]);

  useEffect(() => {
    const graphMap = graphMapRef.current;
    if (!graphMap || typeof ResizeObserver === "undefined") {
      return;
    }

    let timeoutId = 0;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(fitGraphToView, 450);
    });
    observer.observe(graphMap);

    return () => {
      window.clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [fitGraphToView]);

  if (graph.nodes.length === 0) {
    return (
      <section className="relationship-graph empty-graph" aria-label="Relationship graph">
        <span>No entities yet</span>
      </section>
    );
  }

  return (
    <section className="relationship-graph" aria-label="Relationship graph">
      <div className="graph-summary">
        <span>{graph.nodes.length} nodes</span>
        <span>{graph.edges.length} edges</span>
      </div>

      <div className="graph-map reagraph-map" ref={graphMapRef}>
        <Suspense
          fallback={
            <div className="graph-loading" role="status" aria-label="Loading graph">
              <span aria-hidden="true" />
            </div>
          }
        >
          <ReagraphCanvas
            actives={selectedIds}
            aggregateEdges={false}
            animated
            cameraMode="pan"
            defaultNodeSize={10}
            draggable
            edgeArrowPosition="end"
            edgeInterpolation="curved"
            edgeLabelPosition="natural"
            edges={graph.edges}
            key={graphRenderKey}
            labelType="all"
            layoutOverrides={layoutOverrides}
            layoutType="custom"
            maxNodeSize={18}
            minNodeSize={7}
            nodes={graph.nodes}
            onEdgeClick={(edge) => selectStatementForEdge(edge, statementByRelationshipId, onSelectStatement)}
            onNodeClick={(node) =>
              selectStatementForNode(node, statementByEntityId, onSelectStatement, onSelectEntity)
            }
            ref={graphRef}
            selections={selectedIds}
            sizingType="default"
            theme={ONTOLOGY_GRAPH_THEME}
          />
        </Suspense>
      </div>
    </section>
  );
}

function buildOntologyGraphData(draft: OntologyDraft): OntologyGraphData {
  const entityById = new Map(draft.entities.map((entity) => [entity.id, entity]));
  const degreeByEntityId = new Map(draft.entities.map((entity) => [entity.id, 0]));
  const relationshipById = new Map(draft.relationships.map((relationship) => [relationship.id, relationship]));

  for (const relationship of draft.relationships) {
    ensureGraphEntity(entityById, degreeByEntityId, relationship.subject_entity_id);
    ensureGraphEntity(entityById, degreeByEntityId, relationship.object_entity_id);
    degreeByEntityId.set(
      relationship.subject_entity_id,
      (degreeByEntityId.get(relationship.subject_entity_id) ?? 0) + 1,
    );
    degreeByEntityId.set(
      relationship.object_entity_id,
      (degreeByEntityId.get(relationship.object_entity_id) ?? 0) + 1,
    );
  }

  const positionsByEntityId = buildGraphPositions([...entityById.values()], degreeByEntityId);
  const nodes: GraphNode[] = [...entityById.values()]
    .sort((left, right) => left.label.localeCompare(right.label))
    .map((entity) => {
      const degree = degreeByEntityId.get(entity.id) ?? 0;
      const position = positionsByEntityId.get(entity.id) ?? { x: 0, y: 0, z: 0 };
      return {
        cluster: entity.entity_type,
        data: {
          degree,
          description: entity.description,
          entityType: entity.entity_type,
        },
        fill: entityFill(entity.entity_type),
        fx: position.x,
        fy: position.y,
        fz: position.z,
        id: entity.id,
        label: entity.label,
        labelVisible: true,
        size: 8 + Math.min(10, degree * 1.4),
        subLabel: entity.entity_type,
      };
    });

  const edges: GraphEdge[] = [...draft.relationships]
    .sort((left, right) => left.label.localeCompare(right.label))
    .map((relationship) => ({
      arrowPlacement: "end",
      data: {
        cardinality: relationship.cardinality?.text ?? null,
        relationshipType: relationship.relationship_type,
      },
      fill: "#94a9d8",
      id: relationship.id,
      interpolation: "curved",
      label: relationship.label,
      labelVisible: true,
      size: 2,
      source: relationship.subject_entity_id,
      subLabel: relationshipMeta(relationship),
      target: relationship.object_entity_id,
    }));

  return { degreeByEntityId, edges, nodes, positionsByEntityId, relationshipById };
}

function buildGraphPositions(entities: Entity[], degreeByEntityId: Map<string, number>) {
  const positionsByEntityId = new Map<string, GraphPosition>();
  const sortedEntities = [...entities].sort((left, right) => {
    const degreeDelta = (degreeByEntityId.get(right.id) ?? 0) - (degreeByEntityId.get(left.id) ?? 0);
    return degreeDelta || left.label.localeCompare(right.label);
  });

  if (sortedEntities.length === 0) {
    return positionsByEntityId;
  }

  const [centerEntity, ...outerEntities] = sortedEntities;
  positionsByEntityId.set(centerEntity.id, { x: 0, y: 0, z: 0 });

  outerEntities.forEach((entity, index) => {
    const ring = Math.floor(index / 8);
    const ringStart = ring * 8;
    const ringIndex = index - ringStart;
    const ringSize = Math.min(8 + ring * 4, outerEntities.length - ringStart);
    const radius = 175 + ring * 145;
    const angle = -Math.PI / 2 + (ringIndex / Math.max(1, ringSize)) * Math.PI * 2;
    positionsByEntityId.set(entity.id, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      z: 0,
    });
  });

  return positionsByEntityId;
}

function ensureGraphEntity(
  entityById: Map<string, Entity>,
  degreeByEntityId: Map<string, number>,
  entityId: string,
) {
  if (entityById.has(entityId)) {
    return;
  }
  entityById.set(entityId, {
    aliases: [],
    confidence: 0,
    description: "",
    entity_type: "entity",
    examples: [],
    id: entityId,
    label: entityId,
  });
  degreeByEntityId.set(entityId, 0);
}

function relationshipMeta(relationship: Relationship) {
  return [
    relationship.relationship_type,
    relationship.cardinality?.text ? relationship.cardinality.text : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function entityFill(entityType: string) {
  switch (entityType) {
    case "role":
      return "#2b6f7b";
    case "document":
      return "#5d5fa8";
    case "event":
      return "#6f5b2b";
    case "process":
      return "#356c51";
    case "state":
      return "#704965";
    case "attribute":
    case "value":
      return "#6c5d31";
    case "external_reference":
      return "#526070";
    default:
      return "#24486f";
  }
}

function selectStatementForEdge(
  edge: InternalGraphEdge,
  statementByRelationshipId: Map<string, NaturalLanguageStatement>,
  onSelectStatement: (statementId: string) => void,
) {
  const statement = statementByRelationshipId.get(edge.id);
  if (statement) {
    onSelectStatement(statement.id);
  }
}

function selectStatementForNode(
  node: InternalGraphNode,
  statementByEntityId: Map<string, NaturalLanguageStatement>,
  onSelectStatement: (statementId: string) => void,
  onSelectEntity: (entityId: string) => void,
) {
  const statement = statementByEntityId.get(node.id);
  if (statement) {
    onSelectStatement(statement.id);
  }
  onSelectEntity(node.id);
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

function stopPropagation(event: MouseEvent<HTMLElement>) {
  event.stopPropagation();
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
