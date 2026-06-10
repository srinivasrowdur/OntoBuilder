import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { GenerationCounts, GenerationStep } from "../types";

interface GenerationProgressProps {
  counts: GenerationCounts | null;
  entities: string[];
  steps: GenerationStep[];
  startedAt: number;
}

export function GenerationProgress({
  counts,
  entities,
  steps,
  startedAt,
}: GenerationProgressProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const intervalId = globalThis.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => globalThis.clearInterval(intervalId);
  }, [startedAt]);

  return (
    <div aria-live="polite" className="generation-progress" role="status">
      <div className="generation-progress-header">
        <span className="generation-progress-title">Building your ontology</span>
        <span className="generation-progress-elapsed">{formatElapsed(elapsedSeconds)}</span>
      </div>
      <ol className="generation-progress-steps">
        {steps.map((step) => (
          <li className={`generation-progress-step ${step.status}`} key={step.key}>
            {step.status === "done" ? (
              <Check aria-hidden size={14} />
            ) : (
              <Loader2 aria-hidden className="spin" size={14} />
            )}
            <span>{step.label}</span>
          </li>
        ))}
      </ol>
      {counts ? (
        <div className="generation-progress-counts">
          {counts.entities} entities · {counts.relationships} relationships · {counts.rules} rules
        </div>
      ) : null}
      {entities.length > 0 ? (
        <div aria-label="Drafted entities" className="generation-progress-entities">
          {entities.map((label) => (
            <span className="generation-progress-entity" key={label}>
              {label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}
