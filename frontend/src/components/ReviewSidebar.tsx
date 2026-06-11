import { X } from "lucide-react";
import { useEffect } from "react";
import type { Entity, OntologyDraft, ReviewStatus, StatementReview } from "../types";
import { EntityInspector } from "./EntityInspector";
import { StatementInspector } from "./StatementInspector";

type InspectorMode = "entity" | "statement";

interface ReviewSidebarProps {
  draft: OntologyDraft | null;
  mobileOpen: boolean;
  onMobileClose: () => void;
  inspectorMode: InspectorMode;
  selectedEntity: Entity | null;
  selectedSavedEntity: Entity | null;
  selectedReview: StatementReview | null;
  onPreviewEntityLabel: (entityId: string, label: string | null) => void;
  onPreviewStatementText: (statementId: string, text: string | null) => void;
  onRenameEntity: (entityId: string, label: string) => Promise<void>;
  onReviewStatement: (statementId: string, status: ReviewStatus, text?: string) => Promise<void>;
  onSelectEntity: (entityId: string) => void;
  onSelectStatement: (statementId: string) => void;
}

export function ReviewSidebar({
  draft,
  inspectorMode,
  mobileOpen,
  onMobileClose,
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

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }
    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        onMobileClose();
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [mobileOpen, onMobileClose]);

  return (
    <>
      {mobileOpen ? (
        <button
          aria-label="Close inspector"
          className="sidebar-sheet-scrim"
          onClick={onMobileClose}
          type="button"
        />
      ) : null}
      <aside
        className={`sidebar${mobileOpen ? " sheet-open" : ""}`}
        aria-label="Ontology review controls"
      >
        <section className="panel inspector-title">
          <div className="panel-heading">
            <span>Inspector</span>
            <small>{modeLabel}</small>
          </div>
          <button
            aria-label="Close inspector"
            className="sidebar-sheet-close"
            onClick={onMobileClose}
            type="button"
          >
            <X size={16} />
          </button>
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
    </>
  );
}
