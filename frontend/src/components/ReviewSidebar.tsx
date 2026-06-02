import {
  GitBranch,
  Info,
  PanelRight,
  Tags,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Entity, OntologyDraft, Relationship } from "../types";

interface ReviewSidebarProps {
  draft: OntologyDraft | null;
  selectedEntity: Entity | null;
  onSelectEntity: (entityId: string) => void;
}

export function ReviewSidebar({
  draft,
  selectedEntity,
  onSelectEntity,
}: ReviewSidebarProps) {
  return (
    <aside className="sidebar" aria-label="Ontology review controls">
      <section className="panel inspector-title">
        <div className="panel-heading">
          <span>Inspector</span>
          <small>Xcode style</small>
        </div>
      </section>

      <EntityInspector draft={draft} entity={selectedEntity} onSelectEntity={onSelectEntity} />
    </aside>
  );
}

function EntityInspector({
  draft,
  entity,
  onSelectEntity,
}: {
  draft: OntologyDraft | null;
  entity: Entity | null;
  onSelectEntity: (entityId: string) => void;
}) {
  if (!draft || !entity) {
    return (
      <section className="selected-card inspector-card">
        <div className="inspector-section-title">
          <PanelRight size={16} />
          <span>Entity properties</span>
        </div>
        <p className="inspector-empty">Select an entity from the text or graph to inspect its structured metadata.</p>
      </section>
    );
  }

  const entityById = new Map(draft.entities.map((candidate) => [candidate.id, candidate]));
  const outgoing = draft.relationships.filter(
    (relationship) => relationship.subject_entity_id === entity.id,
  );
  const incoming = draft.relationships.filter(
    (relationship) => relationship.object_entity_id === entity.id,
  );
  const rules = draft.rules.filter(
    (rule) => rule.applies_to_entity_id === entity.id || rule.value_entity_id === entity.id,
  );
  const statements = draft.statements.filter(
    (statement) =>
      statement.subject_entity_id === entity.id ||
      statement.object_entity_id === entity.id ||
      Boolean(
        statement.relationship_id &&
          draft.relationships.some(
            (relationship) =>
              relationship.id === statement.relationship_id &&
              (relationship.subject_entity_id === entity.id ||
                relationship.object_entity_id === entity.id),
          ),
      ) ||
      Boolean(
        statement.rule_id &&
          draft.rules.some(
            (rule) =>
              rule.id === statement.rule_id &&
              (rule.applies_to_entity_id === entity.id || rule.value_entity_id === entity.id),
          ),
      ),
  );
  const iri = entityIri(draft, entity);
  const parentEntity = entity.parent_entity_id ? entityById.get(entity.parent_entity_id) : null;

  return (
    <section className="selected-card inspector-card" aria-label="Entity inspector">
      <div className="entity-inspector-header">
        <div>
          <span className="status-pill inspector-pill">{entity.entity_type}</span>
          <h2>{entity.label}</h2>
        </div>
        <span>{Math.round(entity.confidence * 100)}%</span>
      </div>

      <label className="field-label" htmlFor="entity-inspector-select">
        Selected entity
      </label>
      <select
        aria-label="Selected entity"
        className="entity-select"
        id="entity-inspector-select"
        onChange={(event) => onSelectEntity(event.target.value)}
        value={entity.id}
      >
        {draft.entities.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.label}
          </option>
        ))}
      </select>

      <div className="inspector-grid">
        <InspectorStat label="Outgoing" value={outgoing.length} />
        <InspectorStat label="Incoming" value={incoming.length} />
        <InspectorStat label="Rules" value={rules.length} />
        <InspectorStat label="Statements" value={statements.length} />
      </div>

      <InspectorSection icon={<Info size={15} />} title="Identity">
        <dl className="property-list">
          <div>
            <dt>ID</dt>
            <dd>{entity.id}</dd>
          </div>
          <div>
            <dt>IRI</dt>
            <dd>{iri}</dd>
          </div>
          {parentEntity ? (
            <div>
              <dt>Parent</dt>
              <dd>{parentEntity.label}</dd>
            </div>
          ) : null}
        </dl>
        {entity.description ? <p>{entity.description}</p> : null}
      </InspectorSection>

      {entity.aliases.length > 0 || entity.examples.length > 0 ? (
        <InspectorSection icon={<Tags size={15} />} title="Labels">
          {entity.aliases.length > 0 ? (
            <ChipRow label="Aliases" values={entity.aliases} />
          ) : null}
          {entity.examples.length > 0 ? (
            <ChipRow label="Examples" values={entity.examples} />
          ) : null}
        </InspectorSection>
      ) : null}

      <InspectorSection icon={<GitBranch size={15} />} title="Relationships">
        <RelationshipList
          direction="outgoing"
          entityById={entityById}
          onSelectEntity={onSelectEntity}
          relationships={outgoing}
        />
        <RelationshipList
          direction="incoming"
          entityById={entityById}
          onSelectEntity={onSelectEntity}
          relationships={incoming}
        />
        {outgoing.length === 0 && incoming.length === 0 ? (
          <p className="inspector-empty">No relationships reference this entity yet.</p>
        ) : null}
      </InspectorSection>

      {statements.length > 0 ? (
        <InspectorSection icon={<PanelRight size={15} />} title="Statement references">
          <div className="statement-reference-list">
            {statements.slice(0, 4).map((statement) => (
              <span key={statement.id}>{statement.text}</span>
            ))}
            {statements.length > 4 ? <strong>+{statements.length - 4} more</strong> : null}
          </div>
        </InspectorSection>
      ) : null}
    </section>
  );
}

function InspectorSection({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <section className="inspector-section">
      <div className="inspector-section-title">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </section>
  );
}

function InspectorStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ChipRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="chip-row">
      <span>{label}</span>
      <div>
        {values.map((value) => (
          <span key={value}>{value}</span>
        ))}
      </div>
    </div>
  );
}

function RelationshipList({
  direction,
  entityById,
  onSelectEntity,
  relationships,
}: {
  direction: "incoming" | "outgoing";
  entityById: Map<string, Entity>;
  onSelectEntity: (entityId: string) => void;
  relationships: Relationship[];
}) {
  if (relationships.length === 0) {
    return null;
  }

  return (
    <div className="relationship-list">
      <span>{direction === "outgoing" ? "Outgoing" : "Incoming"}</span>
      {relationships.map((relationship) => {
        const relatedEntityId =
          direction === "outgoing"
            ? relationship.object_entity_id
            : relationship.subject_entity_id;
        const relatedEntity = entityById.get(relatedEntityId);

        return (
          <button key={relationship.id} onClick={() => onSelectEntity(relatedEntityId)} type="button">
            <span>{relationship.label}</span>
            <strong>{relatedEntity?.label ?? relatedEntityId}</strong>
          </button>
        );
      })}
    </div>
  );
}

function entityIri(draft: OntologyDraft, entity: Entity) {
  return `${namespaceIri(draft)}${entityLocalName(entity)}`;
}

function namespaceIri(draft: OntologyDraft) {
  const suggestion = draft.namespace_suggestion.trim();
  if (/^https?:\/\//.test(suggestion)) {
    return /[#/]$/.test(suggestion) ? suggestion : `${suggestion}#`;
  }
  return `https://example.org/ontology/${namespacePath(suggestion || draft.domain)}#`;
}

function entityLocalName(entity: Entity) {
  const candidate = titleCaseIdentifier(entity.label) || titleCaseIdentifier(entity.id);
  return candidate || "Entity";
}

function titleCaseIdentifier(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, " ")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("");
}

function namespacePath(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ontology";
}
