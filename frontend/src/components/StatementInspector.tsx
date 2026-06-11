import { CircleDot, GitBranch, Info, PanelRight, Type } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
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
import { EntityLink, InlineTextArea, InspectorSection, PropertyItem } from "./InspectorPrimitives";

interface StatementInspectorProps {
  draft: OntologyDraft | null;
  onPreviewStatementText: (statementId: string, text: string | null) => void;
  onReviewStatement: (statementId: string, status: ReviewStatus, text?: string) => Promise<void>;
  onSelectEntity: (entityId: string) => void;
  review: StatementReview | null;
}

export function StatementInspector({
  draft,
  onPreviewStatementText,
  onReviewStatement,
  onSelectEntity,
  review,
}: StatementInspectorProps) {
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
        <p className="inspector-empty">
          Select a statement row or graph edge to inspect and edit it.
        </p>
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
              className={[
                `status-${action.status}`,
                review.status === action.status ? "active" : "",
              ].join(" ")}
              disabled={savingAction !== null || (!textChanged && review.status === action.status)}
              key={action.status}
              onClick={() => void applyStatement(action.status)}
              type="button"
            >
              {action.label}
            </button>
          ))}
        </div>
      </InspectorSection>

      <StatementStructure draft={draft} onSelectEntity={onSelectEntity} statement={statement} />

      <InspectorSection icon={<GitBranch size={15} />} title="Impact">
        <div className="impact-list">
          {review.impact.entities.map((reference) => (
            <button key={reference.id} onClick={() => onSelectEntity(reference.id)} type="button">
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
        <EntityLink
          entity={subject}
          entityId={statement.subject_entity_id}
          onSelectEntity={onSelectEntity}
        />
      </PropertyItem>
      <PropertyItem label="Predicate">{relationship?.label ?? statement.predicate}</PropertyItem>
      {statement.object_entity_id ? (
        <PropertyItem label="Object">
          <EntityLink
            entity={object}
            entityId={statement.object_entity_id}
            onSelectEntity={onSelectEntity}
          />
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
        <EntityLink
          entity={subject}
          entityId={statement.subject_entity_id}
          onSelectEntity={onSelectEntity}
        />
      </PropertyItem>
      <PropertyItem label="Severity">{rule?.severity ?? "rule"}</PropertyItem>
      <PropertyItem label="Predicate">{rule?.predicate ?? statement.predicate}</PropertyItem>
      <PropertyItem label="Operator">{rule?.operator ?? "exists"}</PropertyItem>
      {valueEntity ? (
        <PropertyItem label="Value">
          <EntityLink
            entity={valueEntity}
            entityId={valueEntity.id}
            onSelectEntity={onSelectEntity}
          />
        </PropertyItem>
      ) : rule && ruleValuePhrase(rule) ? (
        <PropertyItem label="Value">{ruleValuePhrase(rule)}</PropertyItem>
      ) : null}
    </dl>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
