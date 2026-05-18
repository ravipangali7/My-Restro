import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Primary text button / link in card action rows (owner lists). */
export const ownerListActionClass =
  "inline-flex items-center rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm hover:border-primary/40 hover:bg-primary/[0.06]";
/** Secondary / cancel-style control in card action rows. */
export const ownerListActionSecondaryClass =
  "inline-flex items-center rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-text-secondary shadow-sm hover:border-primary/40 hover:bg-primary/[0.06]";
/** Destructive control (e.g. delete) in card action rows. */
export const ownerListActionDangerClass =
  "inline-flex items-center rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-error shadow-sm hover:border-error/35 hover:bg-error/10";

export interface OwnerEntityCardProps {
  /** Icon or avatar inside the tinted square (left). */
  leading: ReactNode;
  title: ReactNode;
  /** Secondary line (e.g. location or phone). */
  subtitle?: ReactNode;
  /** Status chips, amounts, etc. — left-aligned row. */
  meta?: ReactNode;
  /** Buttons / links — left-aligned under meta (use `stopPropagation` on interactive children when the card is clickable). */
  actions?: ReactNode;
  /** Whole-card tap (e.g. navigate to detail). */
  onClick?: () => void;
  className?: string;
}

/**
 * Card-style list row for owner portal lists (matches compact “entity card” layout:
 * leading icon, left-stacked title / subtitle / meta / actions).
 */
export function OwnerEntityCard({ leading, title, subtitle, meta, actions, onClick, className }: OwnerEntityCardProps) {
  const interactive = Boolean(onClick);
  const fillHeight = Boolean(className?.includes("h-full"));

  return (
    <article
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={cn(
        "flex gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-colors",
        interactive &&
          "cursor-pointer hover:border-primary/35 hover:shadow-md hover:bg-primary/[0.04] active:bg-primary/[0.06]",
        className,
      )}
    >
      <div className="shrink-0 [&>svg]:size-[22px]">{leading}</div>
      <div className={cn("min-w-0 flex-1", fillHeight && "flex flex-col")}>
        <div className="font-display text-base font-semibold leading-snug text-foreground">{title}</div>
        {subtitle ? <div className="mt-1 text-sm text-text-muted">{subtitle}</div> : null}
        {meta ? <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
        {actions ? (
          <div className={cn("mt-3 flex flex-wrap items-center justify-start gap-2", fillHeight && "mt-auto")}>
            {actions}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function OwnerEntityCardStack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-3", className)}>{children}</div>;
}
