import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { GenerationStep } from "../types";

interface GenerationProgressProps {
  steps: GenerationStep[];
  startedAt: number;
}

export function GenerationProgress({ steps, startedAt }: GenerationProgressProps) {
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
