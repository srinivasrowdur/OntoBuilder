import type { DraftReviewSession, NaturalLanguageStatement, OntologyDraft } from "../types";
import {
  getReadiness,
  relationshipById,
  ruleById,
  ruleValuePhrase,
  statementStatus,
} from "../ontology";

interface OntologyCanvasProps {
  draft: OntologyDraft | null;
  session: DraftReviewSession | null;
  selectedStatementId: string | null;
  onSelectStatement: (statementId: string) => void;
}

interface TextRange {
  start: number;
  end: number;
  label: string;
  kind: "entity" | "constraint";
}

export function OntologyCanvas({
  draft,
  session,
  selectedStatementId,
  onSelectStatement,
}: OntologyCanvasProps) {
  const { readiness, blockingIssues } = getReadiness(draft);

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
          <button
            className={[
              "statement-row",
              selectedStatementId === statement.id ? "selected" : "",
              statementStatus(session, statement),
            ].join(" ")}
            key={statement.id}
            onClick={() => onSelectStatement(statement.id)}
            type="button"
          >
            <span className="statement-status" aria-hidden="true" />
            <span className="statement">
              {renderStatementParts(statement, draft).map((part, index) =>
                part.kind === "text" ? (
                  <span key={`${statement.id}-${index}`}>{part.value}</span>
                ) : (
                  <span
                    className={`chip ${part.kind}`}
                    key={`${statement.id}-${index}`}
                  >
                    {part.value}
                  </span>
                ),
              )}
            </span>
          </button>
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

function renderStatementParts(statement: NaturalLanguageStatement, draft: OntologyDraft) {
  const entityLabels = new Map(draft.entities.map((entity) => [entity.id, entity.label]));
  const ranges: TextRange[] = [];

  if (statement.kind === "relationship") {
    const relationship = relationshipById(draft, statement.relationship_id);
    if (relationship) {
      addLabelRange(ranges, statement.text, entityLabels.get(relationship.subject_entity_id), "entity");
      addLabelRange(ranges, statement.text, entityLabels.get(relationship.object_entity_id), "entity");
    }
  }

  if (statement.kind === "rule") {
    const rule = ruleById(draft, statement.rule_id);
    if (rule) {
      addLabelRange(ranges, statement.text, entityLabels.get(rule.applies_to_entity_id), "entity");
      if (rule.value_entity_id) {
        addLabelRange(ranges, statement.text, entityLabels.get(rule.value_entity_id), "entity");
      }
      const valuePhrase = ruleValuePhrase(rule);
      if (valuePhrase) {
        addLiteralRange(ranges, statement.text, valuePhrase, "constraint");
      }
    }
  }

  return splitTextWithRanges(statement.text, ranges);
}

function addLabelRange(
  ranges: TextRange[],
  text: string,
  label: string | undefined,
  kind: TextRange["kind"],
) {
  if (!label) {
    return;
  }
  const match = new RegExp(`\\b${escapeRegExp(label)}s?\\b`, "i").exec(text);
  if (!match) {
    return;
  }
  addRange(ranges, match.index, match.index + match[0].length, match[0], kind);
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
) {
  const overlaps = ranges.some((range) => !(end <= range.start || start >= range.end));
  if (!overlaps) {
    ranges.push({ start, end, label, kind });
  }
}

function splitTextWithRanges(text: string, ranges: TextRange[]) {
  if (ranges.length === 0) {
    return [{ kind: "text" as const, value: text }];
  }

  const sortedRanges = [...ranges].sort((a, b) => a.start - b.start);
  const parts: Array<{ kind: "text" | "entity" | "constraint"; value: string }> = [];
  let cursor = 0;

  for (const range of sortedRanges) {
    if (range.start > cursor) {
      parts.push({ kind: "text", value: text.slice(cursor, range.start) });
    }
    parts.push({ kind: range.kind, value: range.label });
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
