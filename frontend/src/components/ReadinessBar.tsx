import type { ReadinessReport } from "../ontology";

export function ReadinessBar({
  onToggleWorklist,
  report,
  showWorklist,
}: {
  onToggleWorklist: () => void;
  report: ReadinessReport;
  showWorklist: boolean;
}) {
  return (
    <div className="readiness-bar" aria-label="Review progress">
      <div className="readiness-progress">
        <span className="readiness-track" aria-hidden="true">
          <span className="readiness-fill" style={{ width: `${report.readiness}%` }} />
        </span>
        <span className="readiness-summary">
          <strong>{report.decidedCount}</strong> of <strong>{report.totalCount}</strong> reviewed
        </span>
      </div>
      <div className="readiness-stages" aria-label="Workflow stage">
        {(["review", "resolve", "export"] as const).map((stage) => (
          <span className={`readiness-stage${report.stage === stage ? " active" : ""}`} key={stage}>
            {stage === "review" ? "Review" : stage === "resolve" ? "Resolve" : "Export"}
          </span>
        ))}
      </div>
      <span aria-hidden className="keyboard-hint">
        <kbd>j</kbd>
        <kbd>k</kbd> navigate · <kbd>a</kbd> accept · <kbd>r</kbd> reject · <kbd>c</kbd> clarify
      </span>
      {report.blockingCount > 0 ? (
        <button
          className={`readiness-worklist-toggle${showWorklist ? " active" : ""}`}
          onClick={onToggleWorklist}
          type="button"
        >
          {showWorklist ? "Show all statements" : `${report.blockingCount} need a decision`}
        </button>
      ) : (
        <span className="readiness-ready">Ready to commit</span>
      )}
    </div>
  );
}
