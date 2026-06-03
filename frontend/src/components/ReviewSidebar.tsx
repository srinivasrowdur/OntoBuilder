import type { Entity, OntologyDraft, ReviewStatus, StatementReview } from "../types";
import { EntityInspector } from "./EntityInspector";
import { StatementInspector } from "./StatementInspector";

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
  onReviewStatement: (statementId: string, status: ReviewStatus, text?: string) => Promise<void>;
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
