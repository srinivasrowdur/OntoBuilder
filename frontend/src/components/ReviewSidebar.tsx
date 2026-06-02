import {
  Braces,
  Check,
  Copy,
  Download,
  FileJson,
  GitBranch,
  HelpCircle,
  Info,
  Loader2,
  PanelRight,
  RotateCcw,
  Sparkles,
  Tags,
  Upload,
  X,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import type {
  CommitResponse,
  DraftReviewSession,
  Entity,
  OntologyDraft,
  Relationship,
  ReviewStatus,
  StatementReview,
} from "../types";
import { getReviewCounts, STATUS_LABELS } from "../ontology";

interface ReviewSidebarProps {
  draft: OntologyDraft | null;
  session: DraftReviewSession | null;
  selectedEntity: Entity | null;
  selectedReview: StatementReview | null;
  prompt: string;
  loading: boolean;
  error: string | null;
  committed: CommitResponse | null;
  canCommit: boolean;
  onPromptChange: (prompt: string) => void;
  onGenerate: () => void;
  onLoadSample: () => void;
  onSelectEntity: (entityId: string) => void;
  onSelectStatement: (statementId: string) => void;
  onDecision: (status: ReviewStatus, text?: string) => void;
  onAcceptAll: () => void;
  onCommit: () => void;
  onDownload: () => void;
}

export function ReviewSidebar({
  draft,
  session,
  selectedEntity,
  selectedReview,
  prompt,
  loading,
  error,
  committed,
  canCommit,
  onPromptChange,
  onGenerate,
  onLoadSample,
  onSelectEntity,
  onSelectStatement,
  onDecision,
  onAcceptAll,
  onCommit,
  onDownload,
}: ReviewSidebarProps) {
  const counts = session ? getReviewCounts(session.statements) : null;
  const acceptedCount = counts ? counts.accepted + counts.edited : 0;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onGenerate();
  }

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
        <p className="inspector-empty">Select an entity from the text or graph to inspect OWL-ready metadata.</p>
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
  const owlFragment = buildEntityOwlFragment(draft, entity, entityById);
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

      <InspectorSection icon={<Braces size={15} />} title="OWL extraction">
        <div className="owl-actions">
          <button onClick={() => void navigator.clipboard.writeText(owlFragment)} type="button">
            <Copy size={15} />
            Copy OWL
          </button>
          <button onClick={() => downloadOwlFragment(draft, entity, owlFragment)} type="button">
            <Download size={15} />
            Download
          </button>
        </div>
        <pre className="owl-preview">{owlFragment}</pre>
      </InspectorSection>
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

function buildEntityOwlFragment(
  draft: OntologyDraft,
  entity: Entity,
  entityById: Map<string, Entity>,
) {
  const aliases = entity.aliases.map((alias) => `skos:altLabel "${ttlString(alias)}"`);
  const parentEntity = entity.parent_entity_id ? entityById.get(entity.parent_entity_id) : null;
  const predicates = [
    `a ${owlTypeForEntity(entity)}`,
    `rdfs:label "${ttlString(entity.label)}"`,
    entity.description ? `rdfs:comment "${ttlString(entity.description)}"` : null,
    parentEntity ? `rdfs:subClassOf :${entityLocalName(parentEntity)}` : null,
    ...aliases,
  ].filter((predicate): predicate is string => Boolean(predicate));

  const body = predicates
    .map((predicate, index) => {
      const prefix = index === 0 ? "" : "  ";
      const suffix = index === predicates.length - 1 ? " ." : " ;";
      return `${prefix}${predicate}${suffix}`;
    })
    .join("\n");

  return [
    `@prefix : <${namespaceIri(draft)}> .`,
    "@prefix owl: <http://www.w3.org/2002/07/owl#> .",
    "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .",
    "@prefix skos: <http://www.w3.org/2004/02/skos/core#> .",
    "",
    `:${entityLocalName(entity)} ${body}`,
  ].join("\n");
}

function entityIri(draft: OntologyDraft, entity: Entity) {
  return `${namespaceIri(draft)}${entityLocalName(entity)}`;
}

function namespaceIri(draft: OntologyDraft) {
  const suggestion = draft.namespace_suggestion.trim();
  if (/^https?:\/\//.test(suggestion)) {
    return /[#/]$/.test(suggestion) ? suggestion : `${suggestion}#`;
  }
  return `https://example.org/ontology/${slug(suggestion || draft.domain)}#`;
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

function owlTypeForEntity(entity: Entity) {
  if (entity.entity_type === "attribute") {
    return "owl:DatatypeProperty";
  }
  if (entity.entity_type === "value") {
    return "owl:NamedIndividual";
  }
  return "owl:Class";
}

function ttlString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\s+/g, " ").trim();
}

function downloadOwlFragment(draft: OntologyDraft, entity: Entity, owlFragment: string) {
  const blob = new Blob([owlFragment], { type: "text/turtle" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slug(draft.domain)}-${slug(entity.label)}.ttl`;
  link.click();
  URL.revokeObjectURL(url);
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ontology";
}

function SelectedStatementCard({
  canCommit,
  committed,
  onCommit,
  onDecision,
  review,
}: {
  canCommit: boolean;
  committed: CommitResponse | null;
  onCommit: () => void;
  onDecision: (status: ReviewStatus, text?: string) => void;
  review: StatementReview;
}) {
  return (
    <section className="selected-card">
      <span className={`status-pill ${review.status}`}>{STATUS_LABELS[review.status]}</span>
      <p>{review.statement.text}</p>

      <div className="impact-list">
        {review.impact.entities.map((item) => (
          <span key={`entity-${item.id}`}>Entity: {item.label}</span>
        ))}
        {review.impact.relationships.map((item) => (
          <span key={`relationship-${item.id}`}>Relationship: {item.label}</span>
        ))}
        {review.impact.rules.map((item) => (
          <span key={`rule-${item.id}`}>Rule: {item.label}</span>
        ))}
      </div>

      <div className="decision-grid">
        <button onClick={() => onDecision("accepted")} type="button">
          <Check size={16} />
          Accept
        </button>
        <button onClick={() => onDecision("rejected")} type="button">
          <X size={16} />
          Reject
        </button>
        <button onClick={() => onDecision("needs_clarification")} type="button">
          <HelpCircle size={16} />
          Clarify
        </button>
        <button onClick={() => onDecision("pending")} type="button">
          <RotateCcw size={16} />
          Reset
        </button>
      </div>

      <EditStatement review={review} onDecision={onDecision} />

      <button className="commit-button" disabled={!canCommit} onClick={onCommit} type="button">
        <FileJson size={16} />
        Commit accepted
      </button>

      {committed ? (
        <div className="commit-result" role="status">
          <strong>Committed ontology</strong>
          <span>{committed.included_statement_ids.length} statements included</span>
          <span>{committed.ontology.entities.length} entities ready for export</span>
        </div>
      ) : null}
    </section>
  );
}

function EditStatement({
  onDecision,
  review,
}: {
  onDecision: (status: ReviewStatus, text?: string) => void;
  review: StatementReview;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = String(form.get("statementText") ?? "").trim();
    if (text) {
      onDecision("edited", text);
    }
  }

  return (
    <form className="edit-form" onSubmit={handleSubmit}>
      <textarea
        aria-label="Edit selected statement"
        defaultValue={review.statement.text}
        key={review.statement.id}
        name="statementText"
      />
      <button type="submit">
        <Check size={16} />
        Save edit
      </button>
    </form>
  );
}
