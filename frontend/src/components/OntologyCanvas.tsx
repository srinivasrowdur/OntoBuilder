import { Check, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import {
  getReadiness,
  relationshipById,
  ruleById,
  ruleValuePhrase,
  statementStatus,
} from "../ontology";
import type { DraftReviewSession, NaturalLanguageStatement, OntologyDraft } from "../types";

interface OntologyCanvasProps {
  draft: OntologyDraft | null;
  session: DraftReviewSession | null;
  selectedStatementId: string | null;
  onRenameEntity: (entityId: string, label: string) => Promise<void>;
  onSelectStatement: (statementId: string) => void;
}

interface TextRange {
  start: number;
  end: number;
  label: string;
  kind: "entity" | "constraint";
  entityId?: string;
}

interface EditingEntity {
  statementId: string;
  entityId: string;
}

type StatementPart =
  | { kind: "text"; value: string }
  | { kind: "constraint"; value: string }
  | { kind: "entity"; value: string; entityId: string };

export function OntologyCanvas({
  draft,
  onRenameEntity,
  session,
  selectedStatementId,
  onSelectStatement,
}: OntologyCanvasProps) {
  const { readiness, blockingIssues } = getReadiness(draft);
  const [editingEntity, setEditingEntity] = useState<EditingEntity | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [savingEntityId, setSavingEntityId] = useState<string | null>(null);
  const entityLabels = useMemo(
    () => new Map(draft?.entities.map((entity) => [entity.id, entity.label]) ?? []),
    [draft],
  );

  if (!draft) {
    return (
      <section className="ontology-panel empty-state">
        <div className="status-line">
          <span>Export readiness</span>
          <strong>0%</strong>
        </div>
      </section>
    );
  }

  return (
    <section className="ontology-panel" aria-label="Ontology statements">
      <div className="status-line">
        <span>
          Export readiness <strong>{readiness}%</strong>
        </span>
        <span className="dot">·</span>
        <span className="issue">{blockingIssues} blocking issues</span>
      </div>

      <div className="domain-title">
        <span>{draft.domain}</span>
        <small>{draft.scope ?? "general ontology"}</small>
      </div>

      <div className="statement-list">
        {draft.statements.map((statement) => (
          <div
            className={[
              "statement-row",
              selectedStatementId === statement.id ? "selected" : "",
              statementStatus(session, statement),
            ].join(" ")}
            key={statement.id}
            onClick={() => onSelectStatement(statement.id)}
          >
            <span className="statement-status" aria-hidden="true" />
            <span className="statement">
              {renderStatementParts(statement, draft).map((part, index) =>
                renderStatementPart({
                  editingEntity,
                  editingLabel,
                  entityLabels,
                  index,
                  onRenameEntity,
                  onSelectStatement,
                  part,
                  savingEntityId,
                  setEditingEntity,
                  setEditingLabel,
                  setSavingEntityId,
                  statement,
                }),
              )}
            </span>
          </div>
        ))}
      </div>

      <div className="stats-row" aria-label="Ontology statistics">
        <span>{draft.entities.length} entities</span>
        <span>{draft.relationships.length} relationships</span>
        <span>{draft.rules.length} rules</span>
        <span>{draft.statements.length} statements</span>
      </div>
    </section>
  );
}

function renderStatementPart({
  editingEntity,
  editingLabel,
  entityLabels,
  index,
  onRenameEntity,
  onSelectStatement,
  part,
  savingEntityId,
  setEditingEntity,
  setEditingLabel,
  setSavingEntityId,
  statement,
}: {
  editingEntity: EditingEntity | null;
  editingLabel: string;
  entityLabels: Map<string, string>;
  index: number;
  onRenameEntity: (entityId: string, label: string) => Promise<void>;
  onSelectStatement: (statementId: string) => void;
  part: StatementPart;
  savingEntityId: string | null;
  setEditingEntity: (value: EditingEntity | null) => void;
  setEditingLabel: (value: string) => void;
  setSavingEntityId: (value: string | null) => void;
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

  const isEditing =
    editingEntity?.statementId === statement.id && editingEntity.entityId === part.entityId;

  if (isEditing) {
    return (
      <span className="entity-editor" key={key} onClick={stopPropagation}>
        <input
          aria-label={`Edit ${part.value}`}
          autoFocus
          disabled={savingEntityId === part.entityId}
          onChange={(event) => setEditingLabel(event.target.value)}
          onKeyDown={(event) =>
            handleEntityEditorKeyDown(
              event,
              part.entityId,
              entityLabels,
              editingLabel,
              onRenameEntity,
              setEditingEntity,
              setSavingEntityId,
            )
          }
          style={{ width: `${Math.max(7, editingLabel.length + 1)}ch` }}
          value={editingLabel}
        />
        <button
          aria-label="Save entity name"
          className="entity-edit-action"
          disabled={savingEntityId === part.entityId}
          onClick={(event) =>
            void saveEntityEdit(
              event,
              part.entityId,
              entityLabels,
              editingLabel,
              onRenameEntity,
              setEditingEntity,
              setSavingEntityId,
            )
          }
          title="Save"
          type="button"
        >
          <Check size={15} />
        </button>
        <button
          aria-label="Discard entity name"
          className="entity-edit-action"
          disabled={savingEntityId === part.entityId}
          onClick={(event) => {
            event.stopPropagation();
            setEditingEntity(null);
            setEditingLabel("");
          }}
          title="Discard"
          type="button"
        >
          <X size={15} />
        </button>
      </span>
    );
  }

  return (
    <button
      aria-label={`Edit entity ${entityLabels.get(part.entityId) ?? part.value}`}
      className="chip entity entity-chip"
      key={key}
      onClick={(event) => {
        event.stopPropagation();
        onSelectStatement(statement.id);
        setEditingEntity({ statementId: statement.id, entityId: part.entityId });
        setEditingLabel(entityLabels.get(part.entityId) ?? part.value);
      }}
      title="Edit entity name"
      type="button"
    >
      {part.value}
    </button>
  );
}

function stopPropagation(event: MouseEvent<HTMLElement>) {
  event.stopPropagation();
}

async function saveEntityEdit(
  event: MouseEvent<HTMLButtonElement> | KeyboardEvent<HTMLInputElement>,
  entityId: string,
  entityLabels: Map<string, string>,
  editingLabel: string,
  onRenameEntity: (entityId: string, label: string) => Promise<void>,
  setEditingEntity: (value: EditingEntity | null) => void,
  setSavingEntityId: (value: string | null) => void,
) {
  event.stopPropagation();
  const nextLabel = editingLabel.trim();
  if (!nextLabel || nextLabel === entityLabels.get(entityId)) {
    setEditingEntity(null);
    return;
  }

  setSavingEntityId(entityId);
  try {
    await onRenameEntity(entityId, nextLabel);
    setEditingEntity(null);
  } finally {
    setSavingEntityId(null);
  }
}

function handleEntityEditorKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  entityId: string,
  entityLabels: Map<string, string>,
  editingLabel: string,
  onRenameEntity: (entityId: string, label: string) => Promise<void>,
  setEditingEntity: (value: EditingEntity | null) => void,
  setSavingEntityId: (value: string | null) => void,
) {
  event.stopPropagation();
  if (event.key === "Enter") {
    event.preventDefault();
    void saveEntityEdit(
      event,
      entityId,
      entityLabels,
      editingLabel,
      onRenameEntity,
      setEditingEntity,
      setSavingEntityId,
    );
  }
  if (event.key === "Escape") {
    setEditingEntity(null);
  }
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
