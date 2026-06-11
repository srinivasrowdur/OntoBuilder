import { Check, Download, FileJson, Loader2, Send, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import type { Entity } from "../types";

const GRAMMAR_TEMPLATES: Array<{ label: string; template: string; caretAt: number }> = [
  { label: "Rename…", template: "rename @ to ", caretAt: "rename @".length },
  { label: "Add relationship…", template: "@ owns one or more @", caretAt: 1 },
  { label: "Add rule…", template: "@ must have at least one @", caretAt: 1 },
  { label: "Expand entity…", template: "@ expand relationships", caretAt: 1 },
];

export function OntologyPromptDock({
  canCommit,
  canDownload,
  commitEmphasis = false,
  committableCount = 0,
  downloadEmphasis = false,
  entities,
  loading,
  onAcceptAll,
  onCommit,
  onDownload,
  onGenerate,
  onLoadSample,
  onPromptChange,
  onSubmit,
  pendingCount,
  placement = "bottom",
  prompt,
  reviseMode = false,
}: {
  canCommit: boolean;
  canDownload: boolean;
  commitEmphasis?: boolean;
  committableCount?: number;
  downloadEmphasis?: boolean;
  entities: Entity[];
  loading: boolean;
  onAcceptAll: () => void;
  onCommit: () => void;
  onDownload: () => void;
  onGenerate: () => void;
  onLoadSample: () => void;
  onPromptChange: (prompt: string) => void;
  onSubmit: (event: FormEvent) => void;
  pendingCount: number;
  placement?: "bottom" | "center";
  prompt: string;
  reviseMode?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [caretIndex, setCaretIndex] = useState(0);
  const [activeOptionIndex, setActiveOptionIndex] = useState(0);
  const activeMention = useMemo(() => getActiveMention(prompt, caretIndex), [caretIndex, prompt]);
  const mentionOptions = useMemo(
    () => mentionEntityOptions(entities, activeMention?.query ?? ""),
    [activeMention?.query, entities],
  );
  const showMentionOptions = Boolean(activeMention && mentionOptions.length > 0);

  useEffect(() => {
    setActiveOptionIndex(0);
  }, [activeMention?.query, mentionOptions.length]);

  function updateCaretFromTextarea(textarea: HTMLTextAreaElement) {
    setCaretIndex(textarea.selectionStart);
  }

  function selectMention(entity: Entity) {
    if (!activeMention) {
      return;
    }
    const token = `@${entity.label}`;
    const nextPrompt = `${prompt.slice(0, activeMention.start)}${token}${prompt.slice(activeMention.end)}`;
    const nextCaret = activeMention.start + token.length;
    onPromptChange(nextPrompt);
    setCaretIndex(nextCaret);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  }

  function applyTemplate(template: string, caretAt: number) {
    onPromptChange(template);
    setCaretIndex(caretAt);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(caretAt, caretAt);
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      onGenerate();
      return;
    }

    if (!showMentionOptions) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveOptionIndex((current) => (current + 1) % mentionOptions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveOptionIndex((current) => (current === 0 ? mentionOptions.length - 1 : current - 1));
      return;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      selectMention(mentionOptions[activeOptionIndex] ?? mentionOptions[0]);
    }
  }

  return (
    <form className={`ontology-prompt-dock ${placement}`} onSubmit={onSubmit}>
      {placement === "bottom" ? (
        <div className="dock-actions" aria-label="Ontology actions">
          <button onClick={onLoadSample} type="button">
            <Upload size={15} />
            Sample
          </button>
          <button
            className={downloadEmphasis ? "dock-primary" : ""}
            disabled={!canDownload}
            onClick={onDownload}
            type="button"
          >
            <Download size={15} />
            {downloadEmphasis ? "Download JSON" : "JSON"}
          </button>
          <button disabled={pendingCount === 0} onClick={onAcceptAll} type="button">
            <Check size={15} />
            Accept {pendingCount}
          </button>
          <button
            className={commitEmphasis ? "dock-primary" : ""}
            disabled={!canCommit}
            onClick={onCommit}
            title={canCommit ? undefined : "Accept or edit at least one statement first"}
            type="button"
          >
            <FileJson size={15} />
            Commit{committableCount > 0 ? ` ${committableCount}` : ""}
          </button>
        </div>
      ) : null}

      {placement === "bottom" && reviseMode ? (
        <div className="grammar-chips" aria-label="Revision commands">
          <span className="grammar-chips-label">Revise:</span>
          {GRAMMAR_TEMPLATES.map((item) => (
            <button
              key={item.label}
              onClick={() => applyTemplate(item.template, item.caretAt)}
              title={item.template.replaceAll("@", "@Entity")}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="prompt-compose">
        {showMentionOptions ? (
          <div className="mention-menu" role="listbox">
            {mentionOptions.map((entity, index) => (
              <button
                className={index === activeOptionIndex ? "active" : ""}
                key={entity.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectMention(entity)}
                role="option"
                type="button"
              >
                <span>{entity.label}</span>
                <small>{entity.entity_type.replace(/_/g, " ")}</small>
              </button>
            ))}
          </div>
        ) : null}
        <textarea
          aria-label="Create ontology"
          onBlur={(event) => updateCaretFromTextarea(event.currentTarget)}
          onChange={(event) => {
            onPromptChange(event.target.value);
            updateCaretFromTextarea(event.currentTarget);
          }}
          onClick={(event) => updateCaretFromTextarea(event.currentTarget)}
          onKeyDown={handleKeyDown}
          onKeyUp={(event) => updateCaretFromTextarea(event.currentTarget)}
          placeholder={
            placement === "center"
              ? "Describe the ontology to create"
              : "Revise this ontology with @Entity mentions"
          }
          ref={textareaRef}
          value={prompt}
        />
        <button
          aria-label="Generate ontology"
          className="send-button"
          disabled={loading || !prompt.trim()}
          type="submit"
        >
          {loading ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
        </button>
      </div>
    </form>
  );
}

function getActiveMention(
  value: string,
  caretIndex: number,
): { end: number; query: string; start: number } | null {
  const beforeCaret = value.slice(0, caretIndex);
  const mentionStart = beforeCaret.lastIndexOf("@");
  if (mentionStart < 0) {
    return null;
  }
  const query = beforeCaret.slice(mentionStart + 1);
  if (/[\n.,;:()[\]{}]/.test(query) || query.length > 48) {
    return null;
  }
  return { end: caretIndex, query, start: mentionStart };
}

function mentionEntityOptions(entities: Entity[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (entities.length === 0) {
    return [];
  }
  if (
    normalizedQuery &&
    entities.some(
      (entity) =>
        entity.label.toLowerCase() === normalizedQuery ||
        entity.id.toLowerCase() === normalizedQuery,
    )
  ) {
    return [];
  }

  return entities
    .filter((entity) => {
      if (!normalizedQuery) {
        return true;
      }
      return (
        entity.label.toLowerCase().includes(normalizedQuery) ||
        entity.id.toLowerCase().includes(normalizedQuery) ||
        entity.aliases.some((alias) => alias.toLowerCase().includes(normalizedQuery))
      );
    })
    .sort((left, right) => {
      if (!normalizedQuery) {
        return left.label.localeCompare(right.label);
      }
      const leftStarts = left.label.toLowerCase().startsWith(normalizedQuery);
      const rightStarts = right.label.toLowerCase().startsWith(normalizedQuery);
      if (leftStarts !== rightStarts) {
        return leftStarts ? -1 : 1;
      }
      return left.label.localeCompare(right.label);
    })
    .slice(0, 7);
}
