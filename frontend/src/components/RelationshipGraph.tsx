import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
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
import type { Entity, NaturalLanguageStatement, OntologyDraft, Relationship } from "../types";

interface RelationshipGraphProps {
  draft: OntologyDraft;
  onSelectEntity: (entityId: string) => void;
  onSelectStatement: (statementId: string) => void;
  selectedEntityId: string | null;
  selectedStatementId: string | null;
}

interface OntologyGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  degreeByEntityId: Map<string, number>;
  positionsByEntityId: Map<string, GraphPosition>;
  relationshipById: Map<string, Relationship>;
}

type GraphPosition = Pick<InternalGraphPosition, "x" | "y" | "z">;

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

export function RelationshipGraph({
  draft,
  onSelectEntity,
  onSelectStatement,
  selectedEntityId,
  selectedStatementId,
}: RelationshipGraphProps) {
  const graphRef = useRef<GraphCanvasRef | null>(null);
  const graphMapRef = useRef<HTMLDivElement | null>(null);
  const fitFrameIds = useRef<number[]>([]);
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
  const clearFitFrames = useCallback(() => {
    fitFrameIds.current.forEach(window.cancelAnimationFrame);
    fitFrameIds.current = [];
  }, []);
  const scheduleFitGraphToView = useCallback(() => {
    clearFitFrames();
    if (graph.nodes.length === 0) {
      return;
    }
    const firstFrameId = window.requestAnimationFrame(() => {
      const secondFrameId = window.requestAnimationFrame(fitGraphToView);
      fitFrameIds.current.push(secondFrameId);
    });
    fitFrameIds.current.push(firstFrameId);
  }, [clearFitFrames, fitGraphToView, graph.nodes.length]);
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

  useEffect(() => {
    scheduleFitGraphToView();
    return clearFitFrames;
  }, [clearFitFrames, graphRenderKey, scheduleFitGraphToView]);

  useEffect(() => {
    const graphMap = graphMapRef.current;
    if (!graphMap || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(scheduleFitGraphToView);
    observer.observe(graphMap);

    return () => {
      observer.disconnect();
    };
  }, [scheduleFitGraphToView]);

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
        <GraphErrorBoundary resetKey={graphRenderKey}>
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
              onEdgeClick={(edge) =>
                selectStatementForEdge(edge, statementByRelationshipId, onSelectStatement)
              }
              onNodeClick={(node) =>
                selectStatementForNode(node, statementByEntityId, onSelectStatement, onSelectEntity)
              }
              ref={graphRef}
              selections={selectedIds}
              sizingType="default"
              theme={ONTOLOGY_GRAPH_THEME}
            />
          </Suspense>
        </GraphErrorBoundary>
      </div>
    </section>
  );
}

function buildOntologyGraphData(draft: OntologyDraft): OntologyGraphData {
  const entityById = new Map(draft.entities.map((entity) => [entity.id, entity]));
  const degreeByEntityId = new Map(draft.entities.map((entity) => [entity.id, 0]));
  const relationshipById = new Map(
    draft.relationships.map((relationship) => [relationship.id, relationship]),
  );

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
    const degreeDelta =
      (degreeByEntityId.get(right.id) ?? 0) - (degreeByEntityId.get(left.id) ?? 0);
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

class GraphErrorBoundary extends Component<
  { children: ReactNode; resetKey: string },
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
        <div className="graph-error" role="alert">
          <strong>Graph view failed to load</strong>
          <span>Use the Text view while the graph renderer recovers.</span>
        </div>
      );
    }

    return this.props.children;
  }
}
