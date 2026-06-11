import { Command } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

export interface PaletteCommand {
  id: string;
  title: string;
  hint?: string;
  action: () => void;
}

export function CommandPalette({
  commands,
  onClose,
  open,
}: {
  commands: PaletteCommand[];
  onClose: () => void;
  open: boolean;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return commands;
    }
    return commands.filter((command) =>
      `${command.title} ${command.hint ?? ""}`.toLowerCase().includes(normalized),
    );
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) {
    return null;
  }

  function runCommand(command: PaletteCommand | undefined) {
    if (!command) {
      return;
    }
    onClose();
    command.action();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (matches.length ? (current + 1) % matches.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        matches.length ? (current === 0 ? matches.length - 1 : current - 1) : 0,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      runCommand(matches[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <div className="command-palette-overlay" onClick={onClose} role="presentation">
      <div
        aria-label="Command palette"
        className="command-palette"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="command-palette-input">
          <Command aria-hidden size={15} />
          <input
            aria-label="Search commands"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search…"
            ref={inputRef}
            value={query}
          />
        </div>
        <ul className="command-palette-list" role="listbox">
          {matches.length === 0 ? (
            <li className="command-palette-empty">No matching commands</li>
          ) : (
            matches.map((command, index) => (
              <li key={command.id}>
                <button
                  aria-selected={index === activeIndex}
                  className={index === activeIndex ? "active" : ""}
                  onClick={() => runCommand(command)}
                  onMouseEnter={() => setActiveIndex(index)}
                  role="option"
                  type="button"
                >
                  <span>{command.title}</span>
                  {command.hint ? <small>{command.hint}</small> : null}
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="command-palette-footer">↑↓ navigate · ↵ run · esc close</div>
      </div>
    </div>
  );
}
