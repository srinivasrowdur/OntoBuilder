import { FileText, GitBranch, Info, PanelRight, Tags } from "lucide-react";
import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Entity, OntologyDraft } from "../types";
import {
  ChipRow,
  InlineEdit,
  InspectorSection,
  InspectorStat,
  PropertyItem,
  RelationshipList,
} from "./InspectorPrimitives";

interface EntityInspectorProps {
  draft: OntologyDraft | null;
  entity: Entity | null;
  onPreviewEntityLabel: (entityId: string, label: string | null) => void;
  onRenameEntity: (entityId: string, label: string) => Promise<void>;
  onSelectEntity: (entityId: string) => void;
  onSelectStatement: (statementId: string) => void;
  savedEntity: Entity | null;
}

export function EntityInspector({
  draft,
  entity,
  onPreviewEntityLabel,
  onRenameEntity,
  onSelectEntity,
  onSelectStatement,
  savedEntity,
}: EntityInspectorProps) {
  const savedEntityLabel = savedEntity?.label ?? entity?.label ?? "";
  const [label, setLabel] = useState(savedEntityLabel);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLabel(savedEntityLabel);
    setError(null);
  }, [entity?.id, savedEntityLabel]);

  if (!draft || !entity) {
    return (
      <section className="selected-card inspector-card">
        <div className="inspector-section-title">
          <PanelRight size={16} />
          <span>Entity properties</span>
        </div>
        <p className="inspector-empty">
          Select an entity from the text or graph to inspect its structured metadata.
        </p>
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
  const entityId = entity.id;
  const trimmedLabel = label.trim();
  const labelChanged = trimmedLabel.length > 0 && trimmedLabel !== savedEntityLabel;

  function updateLabelPreview(nextLabel: string) {
    setLabel(nextLabel);
    onPreviewEntityLabel(entityId, nextLabel);
  }

  function revertLabelPreview({ clearError = true } = {}) {
    setLabel(savedEntityLabel);
    if (clearError) {
      setError(null);
    }
    onPreviewEntityLabel(entityId, null);
  }

  async function saveLabel() {
    if (!labelChanged || saving) {
      if (!trimmedLabel) {
        revertLabelPreview();
      }
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onRenameEntity(entityId, trimmedLabel);
      onPreviewEntityLabel(entityId, null);
    } catch (nextError) {
      setError(errorMessage(nextError));
      revertLabelPreview({ clearError: false });
    } finally {
      setSaving(false);
    }
  }

  function handleLabelKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void saveLabel();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      revertLabelPreview();
    }
  }

  return (
    <section className="selected-card inspector-card" aria-label="Entity inspector">
      <div className="entity-inspector-header">
        <div>
          <span className="status-pill inspector-pill">{entity.entity_type}</span>
          <h2>{trimmedLabel || savedEntityLabel}</h2>
        </div>
        <span>{Math.round(entity.confidence * 100)}%</span>
      </div>

      <div className="inspector-grid">
        <InspectorStat label="Outgoing" value={outgoing.length} />
        <InspectorStat label="Incoming" value={incoming.length} />
        <InspectorStat label="Rules" value={rules.length} />
        <InspectorStat label="Statements" value={statements.length} />
      </div>

      <InspectorSection icon={<Info size={15} />} title="Identity">
        <dl className="property-list">
          <PropertyItem label="Name">
            <InlineEdit
              dirty={labelChanged}
              error={error}
              inputId="entity-name-input"
              label="Entity name"
              onBlurSave={saveLabel}
              onChange={updateLabelPreview}
              onKeyDown={handleLabelKeyDown}
              onRevert={revertLabelPreview}
              onSave={saveLabel}
              saving={saving}
              value={label}
            />
          </PropertyItem>
          <PropertyItem label="ID">{entity.id}</PropertyItem>
          <PropertyItem label="IRI">{iri}</PropertyItem>
          {parentEntity ? <PropertyItem label="Parent">{parentEntity.label}</PropertyItem> : null}
        </dl>
        {entity.description ? <p>{entity.description}</p> : null}
      </InspectorSection>

      {entity.aliases.length > 0 || entity.examples.length > 0 ? (
        <InspectorSection icon={<Tags size={15} />} title="Labels">
          {entity.aliases.length > 0 ? <ChipRow label="Aliases" values={entity.aliases} /> : null}
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
        <InspectorSection icon={<FileText size={15} />} title="Statement references">
          <div className="statement-reference-list">
            {statements.slice(0, 5).map((statement) => (
              <button
                className="statement-reference-button"
                key={statement.id}
                onClick={() => onSelectStatement(statement.id)}
                type="button"
              >
                {statement.text}
              </button>
            ))}
            {statements.length > 5 ? <strong>+{statements.length - 5} more</strong> : null}
          </div>
        </InspectorSection>
      ) : null}
    </section>
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
  // The backend normalizes namespaces to ONTOLOGY_AGENT_BASE_IRI; this
  // fallback only covers drafts saved before that normalization existed.
  return `https://ontobuilder.local/ontology/${namespacePath(suggestion || draft.domain)}#`;
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
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "ontology"
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
