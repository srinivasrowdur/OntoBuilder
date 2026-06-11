import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { useEffect } from "react";

export interface ToastItem {
  id: number;
  tone: "error" | "success";
  message: string;
}

const TOAST_DISMISS_MS = 6000;

export function ToastStack({
  onDismiss,
  toasts,
}: {
  onDismiss: (id: number) => void;
  toasts: ToastItem[];
}) {
  useEffect(() => {
    if (toasts.length === 0) {
      return;
    }
    const timers = toasts.map((toast) =>
      globalThis.setTimeout(() => onDismiss(toast.id), TOAST_DISMISS_MS),
    );
    return () => {
      for (const timer of timers) {
        globalThis.clearTimeout(timer);
      }
    };
  }, [onDismiss, toasts]);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div aria-live="polite" className="toast-stack">
      {toasts.map((toast) => (
        <div className={`toast toast-${toast.tone}`} key={toast.id} role="status">
          {toast.tone === "error" ? (
            <AlertTriangle aria-hidden size={15} />
          ) : (
            <CheckCircle2 aria-hidden size={15} />
          )}
          <span>{toast.message}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => onDismiss(toast.id)}
            type="button"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
