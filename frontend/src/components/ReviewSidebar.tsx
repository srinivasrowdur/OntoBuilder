import {
  Check,
  CircleDot,
  FileText,
  GitBranch,
  Info,
  PanelRight,
  Tags,
  Type,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { relationshipById, ruleById, ruleValuePhrase, STATUS_LABELS } from "../ontology";
import type {
  Entity,
  NaturalLanguageStatement,
  OntologyDraft,
  Relationship,
  ReviewStatus,
  Rule,
  StatementReview,
} from "../types";

type InspectorMode = "entity" | "statement";

interface ReviewSidebarProps {
  draft: OntologyDraft | null;
  inspectorMode: InspectorMode;
  selectedEntity: Entity | null;
  selectedSavedEntity: Entity | null;
  selectedReview: StatementReview | null;
  onPreviewEntityLabel: (entityId: string, label: string | null) => void;
  onPreviewStatementText: (statementId: string, text: string | null) => void;
  onRenameEntity: (entityId: string, label: string) => Promise<void>;
  onReviewStatement: (
    statementId: string,
    status: ReviewStatus,
    text?: string,
  ) => Promise<void>;
  onSelectEntity: (entityId: string) => void;
  onSelectStatement: (statementId: string) => void;
}

export function ReviewSidebar({
  draft,
  inspectorMode,
  onPreviewEntityLabel,
  onPreviewStatementText,
  onRenameEntity,
  onReviewStatement,
  onSelectEntity,
  onSelectStatement,
  selectedEntity,
  selectedSavedEntity,
  selectedReview,
}: ReviewSidebarProps) {
  const modeLabel = inspectorMode === "statement" ? "Statement" : "Entity";

  return (
    <aside className="sidebar" aria-label="Ontology review controls">
      <section className="panel inspector-title">
        <div className="panel-heading">
          <span>Inspector</span>
          <small>{modeLabel}</small>
        </div>
      </section>

      {inspectorMode === "statement" ? (
        <StatementInspector
          draft={draft}
          onPreviewStatementText={onPreviewStatementText}
          onReviewStatement={onReviewStatement}
          onSelectEntity={onSelectEntity}
          review={selectedReview}
        />
      ) : (
        <EntityInspector
          draft={draft}
          entity={selectedEntity}
          onPreviewEntityLabel={onPreviewEntityLabel}
          onRenameEntity={onRenameEntity}
          onSelectEntity={onSelectEntity}
          onSelectStatement={onSelectStatement}
          savedEntity={selectedSavedEntity}
        />
      )}
    </aside>
  );
}

function EntityInspector({
  draft,
  entity,
  onPreviewEntityLabel,
  onRenameEntity,
  onSelectEntity,
  onSelectStatement,
  savedEntity,
}: {
  draft: OntologyDraft | null;
  entity: Entity | null;
  onPreviewEntityLabel: (entityId: string, label: string | null) => void;
  onRenameEntity: (entityId: string, label: string) => Promise<void>;
  onSelectEntity: (entityId: string) => void;
  onSelectStatement: (statementId: string) => void;
  savedEntity: Entity | null;
}) {
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

function StatementInspector({
  draft,
  onPreviewStatementText,
  onReviewStatement,
  onSelectEntity,
  review,
}: {
  draft: OntologyDraft | null;
  onPreviewStatementText: (statementId: string, text: string | null) => void;
  onReviewStatement: (
    statementId: string,
    status: ReviewStatus,
    text?: string,
  ) => Promise<void>;
  onSelectEntity: (entityId: string) => void;
  review: StatementReview | null;
}) {
  const [text, setText] = useState(review?.statement.text ?? "");
  const [savingAction, setSavingAction] = useState<ReviewStatus | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(review?.statement.text ?? "");
    setSavingAction(null);
    setError(null);
  }, [review?.statement.id, review?.statement.text]);

  const statement = review?.statement ?? null;
  const textChanged = Boolean(statement && text.trim() && text.trim() !== statement.text);

  if (!draft || !review || !statement) {
    return (
      <section className="selected-card inspector-card">
        <div className="inspector-section-title">
          <PanelRight size={16} />
          <span>Statement properties</span>
        </div>
        <p className="inspector-empty">Select a statement row or graph edge to inspect and edit it.</p>
      </section>
    );
  }

  const statementId = statement.id;
  const savedStatementText = statement.text;

  function updateTextPreview(nextText: string) {
    setText(nextText);
    onPreviewStatementText(statementId, nextText);
  }

  function revertTextPreview({ clearError = true } = {}) {
    setText(savedStatementText);
    if (clearError) {
      setError(null);
    }
    onPreviewStatementText(statementId, null);
  }

  async function applyStatement(status: ReviewStatus) {
    const nextText = text.trim();
    if (status === "edited" && !textChanged) {
      return;
    }
    if (!nextText || savingAction) {
      if (!nextText) {
        revertTextPreview();
      }
      return;
    }

    const textPayload = textChanged || status === "edited" ? nextText : undefined;
    setSavingAction(status === "edited" ? "save" : status);
    setError(null);
    try {
      await onReviewStatement(statementId, status, textPayload);
      onPreviewStatementText(statementId, null);
    } catch (nextError) {
      setError(errorMessage(nextError));
      if (textPayload) {
        revertTextPreview({ clearError: false });
      }
    } finally {
      setSavingAction(null);
    }
  }

  function handleTextKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void applyStatement("edited");
    }
    if (event.key === "Escape") {
      event.preventDefault();
      revertTextPreview();
    }
  }

  return (
    <section className="selected-card inspector-card" aria-label="Statement inspector">
      <div className="entity-inspector-header">
        <div>
          <span className={`status-pill ${review.status}`}>{STATUS_LABELS[review.status]}</span>
          <h2>{statement.kind === "rule" ? "Rule statement" : "Relationship statement"}</h2>
        </div>
        <span>{statement.kind}</span>
      </div>

      <InspectorSection icon={<Info size={15} />} title="Identity">
        <dl className="property-list">
          <PropertyItem label="ID">{statement.id}</PropertyItem>
          <PropertyItem label="Kind">{statement.kind}</PropertyItem>
          <PropertyItem label="Text">
            <InlineTextArea
              dirty={textChanged}
              error={error}
              inputId="statement-text-input"
              label="Statement text"
              onBlurSave={() => applyStatement("edited")}
              onChange={updateTextPreview}
              onKeyDown={handleTextKeyDown}
              onRevert={revertTextPreview}
              onSave={() => applyStatement("edited")}
              saving={savingAction !== null}
              value={text}
            />
          </PropertyItem>
        </dl>
      </InspectorSection>

      <InspectorSection icon={<CircleDot size={15} />} title="Status">
        <div className="status-action-grid">
          {STATEMENT_STATUS_ACTIONS.map((action) => (
            <button
              className={review.status === action.status ? "active" : ""}
              disabled={
                savingAction !== null ||
                (!textChanged && review.status === action.status)
              }
              key={action.status}
              onClick={() => void applyStatement(action.status)}
              type="button"
            >
              {action.label}
            </button>
          ))}
        </div>
      </InspectorSection>

      <StatementStructure
        draft={draft}
        onSelectEntity={onSelectEntity}
        statement={statement}
      />

      <InspectorSection icon={<GitBranch size={15} />} title="Impact">
        <div className="impact-list">
          {review.impact.entities.map((reference) => (
            <button
              key={reference.id}
              onClick={() => onSelectEntity(reference.id)}
              type="button"
            >
              {reference.label}
            </button>
          ))}
          {review.impact.relationships.map((reference) => (
            <span key={reference.id}>{reference.label}</span>
          ))}
          {review.impact.rules.map((reference) => (
            <span key={reference.id}>{reference.label}</span>
          ))}
        </div>
      </InspectorSection>
    </section>
  );
}

const STATEMENT_STATUS_ACTIONS: Array<{ label: string; status: ReviewStatus }> = [
  { label: "Accept", status: "accepted" },
  { label: "Clarify", status: "needs_clarification" },
  { label: "Reject", status: "rejected" },
  { label: "Pending", status: "pending" },
];

function StatementStructure({
  draft,
  onSelectEntity,
  statement,
}: {
  draft: OntologyDraft;
  onSelectEntity: (entityId: string) => void;
  statement: NaturalLanguageStatement;
}) {
  const entityById = useMemo(
    () => new Map(draft.entities.map((entity) => [entity.id, entity])),
    [draft.entities],
  );
  const relationship = relationshipById(draft, statement.relationship_id);
  const rule = ruleById(draft, statement.rule_id);

  return (
    <InspectorSection icon={<Type size={15} />} title="Structure">
      {statement.kind === "relationship" ? (
        <RelationshipStructure
          entityById={entityById}
          onSelectEntity={onSelectEntity}
          relationship={relationship}
          statement={statement}
        />
      ) : (
        <RuleStructure
          entityById={entityById}
          onSelectEntity={onSelectEntity}
          rule={rule}
          statement={statement}
        />
      )}
    </InspectorSection>
  );
}

function RelationshipStructure({
  entityById,
  onSelectEntity,
  relationship,
  statement,
}: {
  entityById: Map<string, Entity>;
  onSelectEntity: (entityId: string) => void;
  relationship?: Relationship;
  statement: NaturalLanguageStatement;
}) {
  const subject = entityById.get(statement.subject_entity_id);
  const object = statement.object_entity_id ? entityById.get(statement.object_entity_id) : null;

  return (
    <dl className="property-list inspector-structure-list">
      <PropertyItem label="Subject">
        <EntityLink entity={subject} entityId={statement.subject_entity_id} onSelectEntity={onSelectEntity} />
      </PropertyItem>
      <PropertyItem label="Predicate">{relationship?.label ?? statement.predicate}</PropertyItem>
      {statement.object_entity_id ? (
        <PropertyItem label="Object">
          <EntityLink entity={object} entityId={statement.object_entity_id} onSelectEntity={onSelectEntity} />
        </PropertyItem>
      ) : null}
      <PropertyItem label="Type">{relationship?.relationship_type ?? "relationship"}</PropertyItem>
      {relationship?.cardinality?.text ? (
        <PropertyItem label="Count">{relationship.cardinality.text}</PropertyItem>
      ) : null}
    </dl>
  );
}

function RuleStructure({
  entityById,
  onSelectEntity,
  rule,
  statement,
}: {
  entityById: Map<string, Entity>;
  onSelectEntity: (entityId: string) => void;
  rule?: Rule;
  statement: NaturalLanguageStatement;
}) {
  const subject = entityById.get(statement.subject_entity_id);
  const valueEntity = rule?.value_entity_id ? entityById.get(rule.value_entity_id) : null;

  return (
    <dl className="property-list inspector-structure-list">
      <PropertyItem label="Target">
        <EntityLink entity={subject} entityId={statement.subject_entity_id} onSelectEntity={onSelectEntity} />
      </PropertyItem>
      <PropertyItem label="Severity">{rule?.severity ?? "rule"}</PropertyItem>
      <PropertyItem label="Predicate">{rule?.predicate ?? statement.predicate}</PropertyItem>
      <PropertyItem label="Operator">{rule?.operator ?? "exists"}</PropertyItem>
      {valueEntity ? (
        <PropertyItem label="Value">
          <EntityLink entity={valueEntity} entityId={valueEntity.id} onSelectEntity={onSelectEntity} />
        </PropertyItem>
      ) : rule && ruleValuePhrase(rule) ? (
        <PropertyItem label="Value">{ruleValuePhrase(rule)}</PropertyItem>
      ) : null}
    </dl>
  );
}

function EntityLink({
  entity,
  entityId,
  onSelectEntity,
}: {
  entity?: Entity | null;
  entityId: string;
  onSelectEntity: (entityId: string) => void;
}) {
  return (
    <button className="inspector-link-button" onClick={() => onSelectEntity(entityId)} type="button">
      {entity?.label ?? entityId}
    </button>
  );
}

function InlineEdit({
  dirty,
  error,
  inputId,
  label,
  onBlurSave,
  onChange,
  onKeyDown,
  onRevert,
  onSave,
  saving,
  value,
}: {
  dirty: boolean;
  error: string | null;
  inputId: string;
  label: string;
  onBlurSave: () => Promise<void> | void;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onRevert: () => void;
  onSave: () => Promise<void> | void;
  saving: boolean;
  value: string;
}) {
  return (
    <div
      className="property-edit-shell"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          void onBlurSave();
        }
      }}
    >
      <div className="property-edit-row">
        <input
          aria-label={label}
          className="property-edit-input"
          disabled={saving}
          id={inputId}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          value={value}
        />
        <button disabled={!dirty || saving} onClick={() => void onSave()} title={`Save ${label}`} type="button">
          <Check size={14} />
        </button>
        <button
          className="ghost-button"
          disabled={!dirty || saving}
          onClick={onRevert}
          title={`Revert ${label}`}
          type="button"
        >
          <X size={14} />
        </button>
      </div>
      {error ? <p className="inspector-error">{error}</p> : null}
    </div>
  );
}

function InlineTextArea({
  dirty,
  error,
  inputId,
  label,
  onBlurSave,
  onChange,
  onKeyDown,
  onRevert,
  onSave,
  saving,
  value,
}: {
  dirty: boolean;
  error: string | null;
  inputId: string;
  label: string;
  onBlurSave: () => Promise<void> | void;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onRevert: () => void;
  onSave: () => Promise<void> | void;
  saving: boolean;
  value: string;
}) {
  return (
    <div
      className="property-edit-shell"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          void onBlurSave();
        }
      }}
    >
      <textarea
        aria-label={label}
        className="property-textarea"
        disabled={saving}
        id={inputId}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        value={value}
      />
      <div className="property-edit-actions">
        <button disabled={!dirty || saving} onClick={() => void onSave()} type="button">
          <Check size={14} />
          Save
        </button>
        <button className="ghost-button" disabled={!dirty || saving} onClick={onRevert} type="button">
          <X size={14} />
          Revert
        </button>
      </div>
      {error ? <p className="inspector-error">{error}</p> : null}
    </div>
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

function PropertyItem({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
