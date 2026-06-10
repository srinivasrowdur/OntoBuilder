import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFrame } from "@react-three/fiber";
import type { ReactNode } from "react";
import type {
  GraphCanvasRef,
  InternalGraphEdge,
  InternalGraphNode,
  LayoutOverrides,
  Theme,
} from "reagraph";
import { Maximize2 } from "lucide-react";
import { buildGraphLegend, buildGraphRenderKey, buildOntologyGraphData } from "../graphModel";
import type { NaturalLanguageStatement, OntologyDraft } from "../types";

interface RelationshipGraphProps {
  draft: OntologyDraft;
  onSelectEntity: (entityId: string) => void;
  onSelectStatement: (statementId: string) => void;
  onShowTextView?: () => void;
  selectedEntityId: string | null;
  selectedStatementId: string | null;
}

interface GraphViewportSize {
  width: number;
  height: number;
}

const MIN_GRAPH_VIEWPORT_SIZE = 24;
const MAX_GRAPH_READY_FRAMES = 90;

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
    inactiveOpacity: 0.78,
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
    inactiveOpacity: 0.5,
    label: {
      activeColor: "#f8d488",
      color: "#f1cf86",
      fontSize: 8,
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

const ONTOLOGY_GRAPH_FOCUS_THEME: Theme = {
  ...ONTOLOGY_GRAPH_THEME,
  node: { ...ONTOLOGY_GRAPH_THEME.node, inactiveOpacity: 0.3 },
  edge: { ...ONTOLOGY_GRAPH_THEME.edge, inactiveOpacity: 0.16 },
};

export function RelationshipGraph({
  draft,
  onSelectEntity,
  onSelectStatement,
  onShowTextView,
  selectedEntityId,
  selectedStatementId,
}: RelationshipGraphProps) {
  const graphRef = useRef<GraphCanvasRef | null>(null);
  const fittedGraphKeyRef = useRef<string | null>(null);
  const [graphMapElement, setGraphMapElement] = useState<HTMLDivElement | null>(null);
  const [graphViewportSize, setGraphViewportSize] = useState<GraphViewportSize | null>(null);
  const [readyFrameAttempt, setReadyFrameAttempt] = useState(0);
  const [fitCompleteKey, setFitCompleteKey] = useState<string | null>(null);
  const [graphAttempt, setGraphAttempt] = useState(0);
  const [graphFitError, setGraphFitError] = useState<Error | null>(null);
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
  const legend = useMemo(() => buildGraphLegend(draft), [draft]);
  const [hoveredEntityId, setHoveredEntityId] = useState<string | null>(null);
  const [hoveredRelationshipId, setHoveredRelationshipId] = useState<string | null>(null);
  const neighborhoodByEntityId = useMemo(() => {
    const neighborhoods = new Map<string, string[]>();
    for (const edge of graph.edges) {
      const source = String(edge.source);
      const target = String(edge.target);
      for (const [nodeId, neighborId] of [
        [source, target],
        [target, source],
      ]) {
        const neighborhood = neighborhoods.get(nodeId) ?? [];
        neighborhood.push(edge.id, neighborId);
        neighborhoods.set(nodeId, neighborhood);
      }
    }
    return neighborhoods;
  }, [graph.edges]);
  const graphRenderKey = useMemo(() => buildGraphRenderKey(graph), [graph]);
  const graphCanvasKey = `${graphRenderKey}:${graphAttempt}`;
  const graphFitKey = `${graphCanvasKey}:${graphViewportSize?.width ?? 0}x${
    graphViewportSize?.height ?? 0
  }`;
  const graphFitComplete = fitCompleteKey === graphFitKey;
  const graphViewportReady = isGraphViewportReady(graphViewportSize);
  const setGraphCanvasRef = useCallback((canvas: GraphCanvasRef | null) => {
    graphRef.current = canvas;
  }, []);
  const markGraphReady = useCallback(() => {
    setReadyFrameAttempt((attempt) => attempt + 1);
  }, []);
  const retryGraph = useCallback(() => {
    graphRef.current = null;
    fittedGraphKeyRef.current = null;
    setFitCompleteKey(null);
    setGraphFitError(null);
    setReadyFrameAttempt(0);
    setGraphAttempt((attempt) => attempt + 1);
  }, []);
  const updateGraphViewportSize = useCallback((element: HTMLDivElement) => {
    const { height, width } = element.getBoundingClientRect();
    const nextSize = {
      height: Math.round(height),
      width: Math.round(width),
    };

    setGraphViewportSize((currentSize) => {
      if (currentSize?.height === nextSize.height && currentSize.width === nextSize.width) {
        return currentSize;
      }
      return nextSize;
    });
  }, []);
  const layoutOverrides = useMemo(
    () =>
      ({
        getNodePosition: (id: string) => graph.positionsByEntityId.get(id) ?? { x: 0, y: 0, z: 0 },
      }) as unknown as LayoutOverrides,
    [graph.positionsByEntityId],
  );
  const selectedRelationshipId = useMemo(() => {
    const selectedStatement = draft.statements.find(
      (statement) => statement.id === selectedStatementId,
    );
    return selectedStatement?.kind === "relationship" ? selectedStatement.relationship_id : null;
  }, [draft.statements, selectedStatementId]);
  const selectedStatement = draft.statements.find(
    (statement) => statement.id === selectedStatementId,
  );
  const selectedRelationship = selectedRelationshipId
    ? graph.relationshipById.get(selectedRelationshipId)
    : null;
  const selectedIds = useMemo(() => {
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
  }, [selectedEntityId, selectedRelationship, selectedStatement]);
  const activeIds = useMemo(() => {
    const hoveredRelationship = hoveredRelationshipId
      ? graph.relationshipById.get(hoveredRelationshipId)
      : null;
    if (hoveredRelationship) {
      return [
        hoveredRelationship.id,
        hoveredRelationship.subject_entity_id,
        hoveredRelationship.object_entity_id,
      ];
    }

    const anchorEntityId =
      hoveredEntityId ?? (selectedRelationship ? null : (selectedIds[0] ?? null));
    if (anchorEntityId) {
      const neighborhood = neighborhoodByEntityId.get(anchorEntityId) ?? [];
      return [...new Set([anchorEntityId, ...neighborhood])];
    }
    return selectedIds;
  }, [
    graph.relationshipById,
    hoveredEntityId,
    hoveredRelationshipId,
    neighborhoodByEntityId,
    selectedIds,
    selectedRelationship,
  ]);
  const fitGraphToView = useCallback(() => {
    try {
      graphRef.current?.fitNodesInView(undefined, { animated: true });
    } catch {
      // Camera errors are non-fatal; the user can pan manually.
    }
  }, []);

  const lastCenteredSelectionRef = useRef<string | null>(null);

  useEffect(() => {
    const selectionKey = selectedIds.join("|");
    if (!graphFitComplete || selectedIds.length === 0) {
      lastCenteredSelectionRef.current = null;
      return;
    }
    // Skip the selection present when the graph first fits; only follow
    // selection changes made after the initial view settles.
    if (lastCenteredSelectionRef.current === null) {
      lastCenteredSelectionRef.current = selectionKey;
      return;
    }
    if (lastCenteredSelectionRef.current === selectionKey) {
      return;
    }
    lastCenteredSelectionRef.current = selectionKey;
    const nodeIds = selectedIds.filter((id) => graph.positionsByEntityId.has(id));
    if (nodeIds.length === 0) {
      return;
    }
    try {
      graphRef.current?.fitNodesInView(nodeIds, { animated: true });
    } catch {
      // Camera follow is a courtesy; ignore camera errors.
    }
  }, [selectedIds, graphFitComplete, graph.positionsByEntityId]);

  useEffect(() => {
    fittedGraphKeyRef.current = null;
    setReadyFrameAttempt(0);
    setFitCompleteKey(null);
    setGraphFitError(null);
  }, [graphCanvasKey]);

  useEffect(() => {
    if (!graphMapElement) {
      return;
    }

    updateGraphViewportSize(graphMapElement);

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => updateGraphViewportSize(graphMapElement));
    observer.observe(graphMapElement);

    return () => {
      observer.disconnect();
    };
  }, [graphMapElement, updateGraphViewportSize]);

  useEffect(() => {
    if (
      !graphViewportReady ||
      readyFrameAttempt === 0 ||
      graph.nodes.length === 0 ||
      graphFitError ||
      graphFitComplete
    ) {
      return;
    }

    const graphApi = graphRef.current;
    const renderedGraph = graphApi?.getGraph() as unknown;
    if (!graphApi || !renderedGraph) {
      if (readyFrameAttempt >= MAX_GRAPH_READY_FRAMES) {
        setGraphFitError(new Error("Graph renderer did not become ready."));
      }
      return;
    }

    if (fittedGraphKeyRef.current === graphFitKey) {
      return;
    }

    try {
      graphApi.fitNodesInView(undefined, { animated: false });
      fittedGraphKeyRef.current = graphFitKey;
      setFitCompleteKey(graphFitKey);
    } catch (error) {
      setGraphFitError(toError(error));
    }
  }, [
    graph.nodes.length,
    graphCanvasKey,
    graphFitComplete,
    graphFitError,
    graphFitKey,
    graphViewportReady,
    readyFrameAttempt,
  ]);

  if (graph.nodes.length === 0) {
    return (
      <section className="relationship-graph empty-graph" aria-label="Relationship graph">
        <span>No entities yet</span>
      </section>
    );
  }

  return (
    <section className="relationship-graph" aria-label="Relationship graph">
      <div className="graph-map">
        {/* Overlays live OUTSIDE .reagraph-map: its `> div` rule forces
            direct children to fill the map and would push the canvas away. */}
        <div className="graph-legend" aria-label="Graph legend">
          <span className="graph-legend-title">
            {graph.nodes.length} entities · {graph.edges.length} relationships
          </span>
          {legend.map((item) => (
            <span className="graph-legend-item" key={item.entityType}>
              <span
                aria-hidden
                className="graph-legend-swatch"
                style={{ background: item.color }}
              />
              {item.label}
              <span className="graph-legend-count">{item.count}</span>
            </span>
          ))}
        </div>
        <button
          aria-label="Fit graph to view"
          className="graph-fit-button"
          onClick={fitGraphToView}
          title="Fit graph to view"
          type="button"
        >
          <Maximize2 size={15} />
        </button>
        <div className="graph-canvas-shell reagraph-map" ref={setGraphMapElement}>
          {graphFitError ? (
            <GraphFailurePanel
              message="The graph canvas mounted, but fitting the ontology view failed."
              onRetry={retryGraph}
              onShowTextView={onShowTextView}
            />
          ) : (
            <GraphErrorBoundary
              onRetry={retryGraph}
              onShowTextView={onShowTextView}
              resetKey={graphCanvasKey}
            >
              <Suspense
                fallback={
                  <div className="graph-loading" role="status" aria-label="Loading graph">
                    <span aria-hidden="true" />
                  </div>
                }
              >
                <ReagraphCanvas
                  actives={activeIds}
                  aggregateEdges={false}
                  animated
                  cameraMode="pan"
                  defaultNodeSize={10}
                  draggable
                  edgeArrowPosition="end"
                  edgeInterpolation="curved"
                  edgeLabelPosition="natural"
                  edges={graph.edges}
                  key={graphCanvasKey}
                  labelType="all"
                  layoutOverrides={layoutOverrides}
                  layoutType="custom"
                  maxNodeSize={25}
                  minNodeSize={10}
                  nodes={graph.nodes}
                  onEdgeClick={(edge) =>
                    selectStatementForEdge(edge, statementByRelationshipId, onSelectStatement)
                  }
                  onEdgePointerOut={() => setHoveredRelationshipId(null)}
                  onEdgePointerOver={(edge) => setHoveredRelationshipId(edge.id)}
                  onNodeClick={(node) =>
                    selectStatementForNode(
                      node,
                      statementByEntityId,
                      onSelectStatement,
                      onSelectEntity,
                    )
                  }
                  onNodePointerOut={() => setHoveredEntityId(null)}
                  onNodePointerOver={(node) => setHoveredEntityId(node.id)}
                  ref={setGraphCanvasRef}
                  selections={selectedIds}
                  sizingType="default"
                  theme={
                    hoveredEntityId || hoveredRelationshipId
                      ? ONTOLOGY_GRAPH_FOCUS_THEME
                      : ONTOLOGY_GRAPH_THEME
                  }
                >
                  <GraphCanvasReadySignal active={!graphFitComplete} onReady={markGraphReady} />
                </ReagraphCanvas>
              </Suspense>
            </GraphErrorBoundary>
          )}
        </div>
      </div>
    </section>
  );
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

function isGraphViewportReady(size: GraphViewportSize | null) {
  return Boolean(
    size && size.width >= MIN_GRAPH_VIEWPORT_SIZE && size.height >= MIN_GRAPH_VIEWPORT_SIZE,
  );
}

function GraphCanvasReadySignal({ active, onReady }: { active: boolean; onReady: () => void }) {
  useFrame(() => {
    if (active) {
      onReady();
    }
  });

  return null;
}

function GraphFailurePanel({
  message,
  onRetry,
  onShowTextView,
}: {
  message: string;
  onRetry: () => void;
  onShowTextView?: () => void;
}) {
  return (
    <div className="graph-error" role="alert">
      <strong>Graph view failed to load</strong>
      <span>{message}</span>
      <div className="graph-error-actions">
        <button type="button" onClick={onRetry}>
          Retry
        </button>
        {onShowTextView ? (
          <button type="button" onClick={onShowTextView}>
            Text view
          </button>
        ) : null}
      </div>
    </div>
  );
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

class GraphErrorBoundary extends Component<
  {
    children: ReactNode;
    onRetry: () => void;
    onShowTextView?: () => void;
    resetKey: string;
  },
  { error: Error | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(previousProps: { resetKey: string }) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <GraphFailurePanel
          message="The graph renderer could not start for this ontology."
          onRetry={this.props.onRetry}
          onShowTextView={this.props.onShowTextView}
        />
      );
    }

    return this.props.children;
  }
}
