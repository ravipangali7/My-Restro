import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Scrollable panel height cap for centered modals (mobile + desktop). */
export const modalPanelScrollClass =
  "max-h-[min(92dvh,calc(100vh-2rem))] overflow-y-auto overscroll-contain";

type AppModalProps = {
  children: ReactNode;
  panelClassName?: string;
  overlayClassName?: string;
  "aria-label"?: string;
  onBackdropClick?: () => void;
};

export function AppModal({
  children,
  panelClassName,
  overlayClassName,
  "aria-label": ariaLabel,
  onBackdropClick,
}: AppModalProps) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4",
        overlayClassName,
      )}
      onClick={onBackdropClick}
    >
      <div
        className={cn(
          "w-full rounded-2xl border border-border bg-card shadow-xl",
          modalPanelScrollClass,
          panelClassName,
        )}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
