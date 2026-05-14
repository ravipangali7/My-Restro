import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SuperAdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 className="font-display font-semibold text-lg text-foreground">{title}</h2>
        {description ? <p className="mt-1 max-w-2xl text-sm text-text-secondary">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SuperAdminPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5", className)}>{children}</div>
  );
}

export function SuperAdminEmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface-alt/40 px-4 py-10 text-center text-sm text-text-muted">
      {children}
    </div>
  );
}
