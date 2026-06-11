import type { GraphEdge, GraphNode, InternalGraphPosition } from "reagraph";
import { entityKindColor } from "./designTokens";
import type { Entity, OntologyDraft, Relationship } from "./types";

export interface OntologyGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  degreeByEntityId: Map<string, number>;
  positionsByEntityId: Map<string, GraphPosition>;
  relationshipById: Map<string, Relationship>;
}

export type GraphPosition = Pick<InternalGraphPosition, "x" | "y" | "z">;

export function buildOntologyGraphData(draft: OntologyDraft): OntologyGraphData {
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
        size: 11 + Math.min(14, degree * 2),
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

export function buildGraphRenderKey(graph: OntologyGraphData) {
  return [
    graph.nodes.map((node) => node.id).join("|"),
    graph.edges.map((edge) => edge.id).join("|"),
  ].join("::");
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
    const radius = 125 + ring * 105;
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

export function entityFill(entityType: string) {
  return entityKindColor(entityType);
}

export function entityTypeLabel(entityType: string) {
  return entityType.replace(/_/g, " ");
}

export function buildGraphLegend(draft: OntologyDraft) {
  const counts = new Map<string, number>();
  for (const entity of draft.entities) {
    counts.set(entity.entity_type, (counts.get(entity.entity_type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([entityType, count]) => ({
      color: entityFill(entityType),
      count,
      entityType,
      label: entityTypeLabel(entityType),
    }));
}
