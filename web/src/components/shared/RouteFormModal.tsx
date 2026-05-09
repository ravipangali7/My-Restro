import type { ReactNode } from "react";
import { X } from "lucide-react";

interface RouteFormModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function RouteFormModal({ title, onClose, children }: RouteFormModalProps) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="relative max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-2xl sm:p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-text-secondary hover:text-foreground"
          aria-label="Close form"
        >
          <X size={16} />
        </button>
        {children}
      </div>
    </div>
  );
}
