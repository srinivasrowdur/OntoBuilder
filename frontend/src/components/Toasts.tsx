import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { useEffect } from "react";

export interface ToastAction {
  label: string;
  onAction: () => void;
}

export interface ToastItem {
  id: number;
  tone: "error" | "success";
  message: string;
  /** Toasts sharing a key replace each other instead of stacking. */
  key?: string;
  action?: ToastAction;
}

const TOAST_DISMISS_MS = 6000;
const ACTION_TOAST_DISMISS_MS = 9000;

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
      globalThis.setTimeout(
        () => onDismiss(toast.id),
        toast.action ? ACTION_TOAST_DISMISS_MS : TOAST_DISMISS_MS,
      ),
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
          {toast.action ? (
            <button
              className="toast-action"
              onClick={() => {
                onDismiss(toast.id);
                toast.action?.onAction();
              }}
              type="button"
            >
              {toast.action.label}
            </button>
          ) : null}
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
