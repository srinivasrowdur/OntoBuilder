import {
  Check,
  Download,
  FileJson,
  HelpCircle,
  Loader2,
  RotateCcw,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import type { FormEvent } from "react";
import type { CommitResponse, DraftReviewSession, ReviewStatus, StatementReview } from "../types";
import { getReviewCounts, STATUS_LABELS } from "../ontology";

interface ReviewSidebarProps {
  session: DraftReviewSession | null;
  selectedReview: StatementReview | null;
  prompt: string;
  loading: boolean;
  error: string | null;
  committed: CommitResponse | null;
  canCommit: boolean;
  onPromptChange: (prompt: string) => void;
  onGenerate: () => void;
  onLoadSample: () => void;
  onSelectStatement: (statementId: string) => void;
  onDecision: (status: ReviewStatus, text?: string) => void;
  onAcceptAll: () => void;
  onCommit: () => void;
  onDownload: () => void;
}

export function ReviewSidebar({
  session,
  selectedReview,
  prompt,
  loading,
  error,
  committed,
  canCommit,
  onPromptChange,
  onGenerate,
  onLoadSample,
  onSelectStatement,
  onDecision,
  onAcceptAll,
  onCommit,
  onDownload,
}: ReviewSidebarProps) {
  const counts = session ? getReviewCounts(session.statements) : null;
  const acceptedCount = counts ? counts.accepted + counts.edited : 0;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onGenerate();
  }

  return (
    <aside className="sidebar" aria-label="Ontology review controls">
      <section className="panel">
        <div className="panel-heading">
          <span>Ontology chat</span>
          <small>Ask any domain</small>
        </div>
      </section>

      <section className="message assistant">
        Ask for any domain and I will draft reviewable ontology statements.
      </section>

      {error ? <section className="message error">{error}</section> : null}

      <form className="prompt-panel" onSubmit={handleSubmit}>
        <textarea
          aria-label="Ask for an ontology"
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder="Build an ontology for healthcare referrals focused on prior authorization"
          value={prompt}
        />
        <button className="primary-button" disabled={loading || !prompt.trim()} type="submit">
          {loading ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
          Generate ontology
        </button>
      </form>

      <div className="button-grid">
        <button onClick={onLoadSample} type="button">
          <Upload size={16} />
          Load sample
        </button>
        <button onClick={onDownload} type="button">
          <Download size={16} />
          Download JSON
        </button>
      </div>

      <section className="panel review-panel">
        <div className="panel-heading">
          <span>Statement review</span>
          <small>API backed</small>
        </div>
      </section>

      {session && counts ? (
        <>
          <div className="review-summary">
            <span>{acceptedCount} accepted</span>
            <span>{counts.pending} pending</span>
            <span>{counts.rejected} rejected</span>
          </div>

          <button className="wide-button" onClick={onAcceptAll} type="button">
            <Check size={16} />
            Accept all pending
          </button>

          <select
            aria-label="Selected statement"
            className="statement-select"
            onChange={(event) => onSelectStatement(event.target.value)}
            value={selectedReview?.statement.id ?? ""}
          >
            {session.statements.map((review) => (
              <option key={review.statement.id} value={review.statement.id}>
                {STATUS_LABELS[review.status]} ·{" "}
                {review.statement.kind === "rule" ? "Rule" : "Relationship"}:{" "}
                {review.statement.text}
              </option>
            ))}
          </select>

          {selectedReview ? (
            <SelectedStatementCard
              canCommit={canCommit}
              committed={committed}
              onCommit={onCommit}
              onDecision={onDecision}
              review={selectedReview}
            />
          ) : null}
        </>
      ) : (
        <section className="review-empty">Load a sample or generate a draft.</section>
      )}
    </aside>
  );
}

function SelectedStatementCard({
  canCommit,
  committed,
  onCommit,
  onDecision,
  review,
}: {
  canCommit: boolean;
  committed: CommitResponse | null;
  onCommit: () => void;
  onDecision: (status: ReviewStatus, text?: string) => void;
  review: StatementReview;
}) {
  return (
    <section className="selected-card">
      <div className="selected-card-meta">
        <span className={`status-pill ${review.status}`}>{STATUS_LABELS[review.status]}</span>
        <span className={`kind-pill ${review.statement.kind}`}>
          {review.statement.kind === "rule" ? "Rule" : "Relationship"}
        </span>
      </div>
      <p>{review.statement.text}</p>

      <div className="impact-list">
        {review.impact.entities.map((item) => (
          <span key={`entity-${item.id}`}>Entity: {item.label}</span>
        ))}
        {review.impact.relationships.map((item) => (
          <span key={`relationship-${item.id}`}>Relationship: {item.label}</span>
        ))}
        {review.impact.rules.map((item) => (
          <span key={`rule-${item.id}`}>Rule: {item.label}</span>
        ))}
      </div>

      <div className="decision-grid">
        <button onClick={() => onDecision("accepted")} type="button">
          <Check size={16} />
          Accept
        </button>
        <button onClick={() => onDecision("rejected")} type="button">
          <X size={16} />
          Reject
        </button>
        <button onClick={() => onDecision("needs_clarification")} type="button">
          <HelpCircle size={16} />
          Clarify
        </button>
        <button onClick={() => onDecision("pending")} type="button">
          <RotateCcw size={16} />
          Reset
        </button>
      </div>

      <EditStatement review={review} onDecision={onDecision} />

      <button className="commit-button" disabled={!canCommit} onClick={onCommit} type="button">
        <FileJson size={16} />
        Commit accepted
      </button>

      {committed ? (
        <div className="commit-result" role="status">
          <strong>Committed ontology</strong>
          <span>{committed.included_statement_ids.length} statements included</span>
          <span>{committed.ontology.entities.length} entities ready for export</span>
        </div>
      ) : null}
    </section>
  );
}

function EditStatement({
  onDecision,
  review,
}: {
  onDecision: (status: ReviewStatus, text?: string) => void;
  review: StatementReview;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = String(form.get("statementText") ?? "").trim();
    if (text) {
      onDecision("edited", text);
    }
  }

  return (
    <form className="edit-form" onSubmit={handleSubmit}>
      <textarea
        aria-label="Edit selected statement"
        defaultValue={review.statement.text}
        key={review.statement.id}
        name="statementText"
      />
      <button type="submit">
        <Check size={16} />
        Save edit
      </button>
    </form>
  );
}
