import { type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmModalProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
  /** Extra controls shown between the message and action buttons (e.g. a required text field). */
  children?: ReactNode;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const variantStyles = {
  danger: { icon: "bg-error-bg text-error", btn: "bg-error text-primary-foreground hover:opacity-90" },
  warning: { icon: "bg-warning-bg text-warning", btn: "bg-warning text-primary-foreground hover:opacity-90" },
  info: { icon: "bg-info-bg text-info", btn: "bg-primary text-primary-foreground hover:bg-primary-600" },
};

export function ConfirmModal({
  open,
  title = "Confirm Action",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  children,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;
  const styles = variantStyles[variant];
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
      <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-sm shadow-xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex flex-col items-center text-center">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${styles.icon}`}>
            <AlertTriangle size={24} />
          </div>
          <h3 className="font-display font-semibold text-lg text-foreground mb-1">{title}</h3>
          <p className="text-sm text-text-secondary mb-5">{message}</p>
        </div>
        {children}
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 h-11 rounded-xl border border-border text-sm font-semibold text-text-secondary hover:bg-surface transition-all">{cancelLabel}</button>
          <button
            type="button"
            disabled={confirmDisabled}
            onClick={onConfirm}
            className={`flex-1 h-11 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:pointer-events-none ${styles.btn}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
