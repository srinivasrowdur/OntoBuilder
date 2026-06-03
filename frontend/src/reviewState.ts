import type { Entity, MentionReference, OntologyDraft } from "./types";
import { escapeRegExp, replaceEntityLabel } from "./utils/text";

export function extractPromptMentions(instruction: string, entities: Entity[]): MentionReference[] {
  const matches: Array<{
    entity: Entity;
    end: number;
    start: number;
    token: string;
  }> = [];

  for (const entity of entities) {
    const tokens = [
      `@${entity.label}`,
      `@${entity.id}`,
      ...entity.aliases.map((alias) => `@${alias}`),
    ];
    for (const token of tokens.filter(Boolean)) {
      const pattern = new RegExp(escapeRegExp(token), "gi");
      for (const match of instruction.matchAll(pattern)) {
        const start = match.index ?? -1;
        if (start < 0) {
          continue;
        }
        matches.push({
          entity,
          end: start + match[0].length,
          start,
          token: match[0],
        });
      }
    }
  }

  const selected: typeof matches = [];
  for (const match of matches.sort((left, right) => {
    const startDelta = left.start - right.start;
    return startDelta || right.token.length - left.token.length;
  })) {
    if (selected.some((item) => !(match.end <= item.start || match.start >= item.end))) {
      continue;
    }
    selected.push(match);
  }

  return selected.map((match) => ({
    id: match.entity.id,
    label: match.entity.label,
    token: match.token,
  }));
}

export function applyPreviewOverrides(
  draft: OntologyDraft | null,
  entityLabelPreviews: Record<string, string>,
  statementTextPreviews: Record<string, string>,
): OntologyDraft | null {
  if (!draft) {
    return null;
  }

  const entityEntries = Object.entries(entityLabelPreviews).filter(([, label]) => label.trim());
  const statementEntries = Object.entries(statementTextPreviews).filter(([, text]) => text.trim());
  if (entityEntries.length === 0 && statementEntries.length === 0) {
    return draft;
  }

  let nextStatements = draft.statements;
  let nextRules = draft.rules;
  const nextEntities = draft.entities.map((entity) => {
    const nextLabel = entityLabelPreviews[entity.id]?.trim();
    return nextLabel ? { ...entity, label: nextLabel } : entity;
  });

  for (const [entityId, nextLabel] of entityEntries) {
    const entity = draft.entities.find((candidate) => candidate.id === entityId);
    if (!entity || entity.label === nextLabel) {
      continue;
    }
    nextStatements = nextStatements.map((statement) => ({
      ...statement,
      text: replaceEntityLabel(statement.text, entity.label, nextLabel),
    }));
    nextRules = nextRules.map((rule) => ({
      ...rule,
      text: replaceEntityLabel(rule.text, entity.label, nextLabel),
    }));
  }

  if (statementEntries.length > 0) {
    const statementPreviewMap = new Map(statementEntries);
    nextStatements = nextStatements.map((statement) => {
      const nextText = statementPreviewMap.get(statement.id)?.trim();
      return nextText ? { ...statement, text: nextText } : statement;
    });
  }

  return {
    ...draft,
    entities: nextEntities,
    rules: nextRules,
    statements: nextStatements,
  };
}

export function setPreviewValue(current: Record<string, string>, id: string, value: string | null) {
  if (value === null) {
    return omitKey(current, id);
  }
  return { ...current, [id]: value };
}

export function omitKey(current: Record<string, string>, id: string) {
  if (!(id in current)) {
    return current;
  }
  const next = { ...current };
  delete next[id];
  return next;
}
