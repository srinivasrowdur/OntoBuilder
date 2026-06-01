import { Check, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import type {
  EntityReferencePayload,
  EntityType,
  OntologyDraft,
  StatementCreatePayload,
} from "../types";

type ComposerMode = "relationship" | "rule";
type EntityChoice =
  | { mode: "existing"; id: string }
  | { mode: "new"; label: string; entityType: EntityType };

const ENTITY_TYPES: EntityType[] = [
  "class",
  "role",
  "event",
  "document",
  "process",
  "state",
  "attribute",
  "value",
  "external_reference",
];

const RULE_OPERATORS = [
  "exists",
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "not_in",
  "min_count",
  "max_count",
  "pattern",
] as const;

interface StatementComposerProps {
  draft: OntologyDraft;
  onCancel: () => void;
  onCreateStatement: (payload: StatementCreatePayload) => Promise<void>;
}

export function StatementComposer({
  draft,
  onCancel,
  onCreateStatement,
}: StatementComposerProps) {
  const [mode, setMode] = useState<ComposerMode>("relationship");
  const [subject, setSubject] = useState<EntityChoice>(() => initialEntityChoice(draft, 0));
  const [object, setObject] = useState<EntityChoice>(() => initialEntityChoice(draft, 1));
  const [relationshipPredicate, setRelationshipPredicate] = useState("relates to");
  const [target, setTarget] = useState<EntityChoice>(() => initialEntityChoice(draft, 0));
  const [severity, setSeverity] = useState<"must" | "should" | "may">("must");
  const [rulePredicate, setRulePredicate] = useState("amount");
  const [operator, setOperator] = useState<(typeof RULE_OPERATORS)[number]>("gt");
  const [ruleValue, setRuleValue] = useState("0");
  const [saving, setSaving] = useState(false);

  const canSave = useMemo(() => {
    if (saving) {
      return false;
    }
    if (mode === "relationship") {
      return (
        isCompleteEntityChoice(subject) &&
        isCompleteEntityChoice(object) &&
        relationshipPredicate.trim().length > 0
      );
    }
    return (
      isCompleteEntityChoice(target) &&
      rulePredicate.trim().length > 0 &&
      (operator === "exists" || ruleValue.trim().length > 0)
    );
  }, [
    mode,
    object,
    operator,
    relationshipPredicate,
    rulePredicate,
    ruleValue,
    saving,
    subject,
    target,
  ]);

  async function handleSave() {
    if (!canSave) {
      return;
    }

    setSaving(true);
    try {
      await onCreateStatement(
        mode === "relationship"
          ? {
              kind: "relationship",
              subject: toEntityReference(subject),
              predicate_label: relationshipPredicate.trim(),
              object: toEntityReference(object),
              relationship_type: "association",
            }
          : {
              kind: "rule",
              applies_to: toEntityReference(target),
              rule_type: "validation",
              severity,
              predicate_label: rulePredicate.trim(),
              operator,
              value: operator === "exists" ? null : parseValue(ruleValue),
            },
      );
      onCancel();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="statement-row composer-row">
      <span className="statement-status composer-status" aria-hidden="true" />
      <div className="composer-body">
        <div className="composer-toolbar" aria-label="Statement type">
          <button
            className={mode === "relationship" ? "active" : ""}
            onClick={() => setMode("relationship")}
            type="button"
          >
            Relationship
          </button>
          <button
            className={mode === "rule" ? "active" : ""}
            onClick={() => setMode("rule")}
            type="button"
          >
            Rule
          </button>
          <button
            aria-label="Save new statement"
            className="composer-action"
            disabled={!canSave}
            onClick={() => void handleSave()}
            title="Save"
            type="button"
          >
            <Check size={17} />
          </button>
          <button
            aria-label="Discard new statement"
            className="composer-action"
            disabled={saving}
            onClick={onCancel}
            title="Discard"
            type="button"
          >
            <X size={17} />
          </button>
        </div>

        {mode === "relationship" ? (
          <div className="statement composer-sentence" aria-label="New relationship statement">
            <span>A </span>
            <EntityPicker draft={draft} onChange={setSubject} value={subject} />
            <input
              aria-label="Relationship phrase"
              className="inline-phrase-input"
              onChange={(event) => setRelationshipPredicate(event.target.value)}
              value={relationshipPredicate}
            />
            <span> a </span>
            <EntityPicker draft={draft} onChange={setObject} value={object} />
            <span>.</span>
          </div>
        ) : (
          <div className="statement composer-sentence" aria-label="New rule statement">
            <span>A </span>
            <EntityPicker draft={draft} onChange={setTarget} value={target} />
            <select
              aria-label="Rule severity"
              className="inline-chip-select constraint"
              onChange={(event) =>
                setSeverity(event.target.value as "must" | "should" | "may")
              }
              value={severity}
            >
              <option value="must">must</option>
              <option value="should">should</option>
              <option value="may">may</option>
            </select>
            <span> have </span>
            <input
              aria-label="Rule property"
              className="inline-phrase-input"
              onChange={(event) => setRulePredicate(event.target.value)}
              value={rulePredicate}
            />
            <select
              aria-label="Rule operator"
              className="inline-chip-select constraint"
              onChange={(event) =>
                setOperator(event.target.value as (typeof RULE_OPERATORS)[number])
              }
              value={operator}
            >
              {RULE_OPERATORS.map((nextOperator) => (
                <option key={nextOperator} value={nextOperator}>
                  {operatorLabel(nextOperator)}
                </option>
              ))}
            </select>
            {operator !== "exists" ? (
              <input
                aria-label="Rule value"
                className="inline-value-input"
                onChange={(event) => setRuleValue(event.target.value)}
                value={ruleValue}
              />
            ) : null}
            <span>.</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function NewStatementButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="new-statement-button" onClick={onClick} type="button">
      <Plus size={17} />
      Statement
    </button>
  );
}

function EntityPicker({
  draft,
  onChange,
  value,
}: {
  draft: OntologyDraft;
  onChange: (value: EntityChoice) => void;
  value: EntityChoice;
}) {
  return (
    <span className="entity-picker">
      <select
        aria-label="Entity"
        className="inline-chip-select entity"
        onChange={(event) => {
          const nextValue = event.target.value;
          onChange(
            nextValue === "__new__"
              ? { mode: "new", label: "", entityType: "class" }
              : { mode: "existing", id: nextValue },
          );
        }}
        value={value.mode === "existing" ? value.id : "__new__"}
      >
        {draft.entities.map((entity) => (
          <option key={entity.id} value={entity.id}>
            {entity.label}
          </option>
        ))}
        <option value="__new__">+ New entity</option>
      </select>

      {value.mode === "new" ? (
        <>
          <input
            aria-label="New entity name"
            className="inline-entity-input"
            onChange={(event) =>
              onChange({ ...value, label: event.target.value })
            }
            placeholder="Entity"
            value={value.label}
          />
          <select
            aria-label="New entity type"
            className="inline-type-select"
            onChange={(event) =>
              onChange({ ...value, entityType: event.target.value as EntityType })
            }
            value={value.entityType}
          >
            {ENTITY_TYPES.map((entityType) => (
              <option key={entityType} value={entityType}>
                {entityType.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </>
      ) : null}
    </span>
  );
}

function initialEntityChoice(draft: OntologyDraft, index: number): EntityChoice {
  const entity = draft.entities[index] ?? draft.entities[0];
  if (entity) {
    return { mode: "existing", id: entity.id };
  }
  return { mode: "new", label: "", entityType: "class" };
}

function isCompleteEntityChoice(choice: EntityChoice) {
  return choice.mode === "existing" ? Boolean(choice.id) : choice.label.trim().length > 0;
}

function toEntityReference(choice: EntityChoice): EntityReferencePayload {
  if (choice.mode === "existing") {
    return { id: choice.id };
  }
  return {
    label: choice.label.trim(),
    entity_type: choice.entityType,
  };
}

function parseValue(value: string) {
  const trimmed = value.trim();
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  const number = Number(trimmed);
  return Number.isFinite(number) && trimmed !== "" ? number : trimmed;
}

function operatorLabel(operator: (typeof RULE_OPERATORS)[number]) {
  const labels: Record<(typeof RULE_OPERATORS)[number], string> = {
    exists: "exists",
    eq: "equal to",
    neq: "not equal to",
    gt: "greater than",
    gte: "at least",
    lt: "less than",
    lte: "at most",
    in: "in",
    not_in: "not in",
    min_count: "min count",
    max_count: "max count",
    pattern: "matching",
  };
  return labels[operator];
}
