import { Check, X } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import type { Entity, Relationship } from "../types";

export function EntityLink({
  entity,
  entityId,
  onSelectEntity,
}: {
  entity?: Entity | null;
  entityId: string;
  onSelectEntity: (entityId: string) => void;
}) {
  return (
    <button
      className="inspector-link-button"
      data-kind={entity?.entity_type ?? "class"}
      onClick={() => onSelectEntity(entityId)}
      type="button"
    >
      {entity?.label ?? entityId}
    </button>
  );
}

export function InlineEdit({
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
        <button
          disabled={!dirty || saving}
          onClick={() => void onSave()}
          title={`Save ${label}`}
          type="button"
        >
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

export function InlineTextArea({
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
        <button
          className="ghost-button"
          disabled={!dirty || saving}
          onClick={onRevert}
          type="button"
        >
          <X size={14} />
          Revert
        </button>
      </div>
      {error ? <p className="inspector-error">{error}</p> : null}
    </div>
  );
}

export function InspectorSection({
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

export function InspectorStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export function PropertyItem({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function ChipRow({ label, values }: { label: string; values: string[] }) {
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

export function RelationshipList({
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
          direction === "outgoing" ? relationship.object_entity_id : relationship.subject_entity_id;
        const relatedEntity = entityById.get(relatedEntityId);

        return (
          <button
            key={relationship.id}
            onClick={() => onSelectEntity(relatedEntityId)}
            type="button"
          >
            <span>{relationship.label}</span>
            <strong>{relatedEntity?.label ?? relatedEntityId}</strong>
          </button>
        );
      })}
    </div>
  );
}
