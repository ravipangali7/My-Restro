import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const PORTAL_CHART_ACCENT = "#4f46e5";

export const chartTooltip = {
  contentStyle: {
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--foreground)",
    boxShadow: "0 12px 40px rgba(26, 26, 26, 0.08)",
    fontSize: 12,
    padding: "8px 12px",
  },
};

export function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/90">{eyebrow}</p>
        ) : null}
        <h3 className="font-display text-lg font-bold tracking-tight text-foreground sm:text-xl">{title}</h3>
        {description ? <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-secondary">{description}</p> : null}
      </div>
      <div
        className="hidden h-px shrink-0 bg-gradient-to-r from-primary/30 via-primary/10 to-transparent sm:block sm:w-32 sm:self-center"
        aria-hidden
      />
    </div>
  );
}

export function StatFrame({ accentClass, children }: { accentClass: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-gradient-to-br p-[1px] shadow-sm transition-all duration-300 hover:shadow-md",
        accentClass,
      )}
    >
      {children}
    </div>
  );
}

export function TableShell({
  title,
  seeAllTo,
  seeAllLabel,
  rowCount,
  totalCount,
  previewRows = 5,
  children,
  emptyWhenNoRows,
}: {
  title: string;
  seeAllTo?: string;
  seeAllLabel?: string;
  rowCount: number;
  totalCount: number;
  previewRows?: number;
  children: ReactNode;
  emptyWhenNoRows?: ReactNode;
}) {
  const showSeeAll = totalCount > previewRows;
  const seeAllText = seeAllLabel ?? "See All";

  return (
    <div className="overflow-hidden rounded-2xl border border-border/90 bg-card shadow-sm ring-1 ring-black/[0.02] transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between gap-3 border-b border-border/80 bg-gradient-to-r from-muted/40 via-transparent to-primary-50/20 px-4 py-3.5 sm:px-5">
        <h3 className="font-display text-sm font-bold tracking-tight text-foreground">{title}</h3>
        {showSeeAll && seeAllTo ? (
          <Link
            to={seeAllTo}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/20 bg-primary-50/90 px-3 py-1 text-xs font-bold text-primary transition-colors hover:border-primary/35 hover:bg-primary-100"
          >
            {seeAllText}
            <ChevronRight className="size-3.5 opacity-80" aria-hidden />
          </Link>
        ) : null}
      </div>
      {rowCount === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-text-muted">
          {emptyWhenNoRows ?? <p>No records yet.</p>}
        </div>
      ) : (
        <div className="overflow-x-auto">{children}</div>
      )}
      {showSeeAll ? (
        <p className="border-t border-border/80 bg-muted/25 px-4 py-2.5 text-center text-[11px] font-medium text-text-muted sm:px-5 sm:text-left">
          Showing {Math.min(previewRows, rowCount)} of {totalCount}
        </p>
      ) : null}
    </div>
  );
}

export function ChartCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden rounded-2xl border-border/90 shadow-md ring-1 ring-black/[0.02]",
        className,
      )}
    >
      <CardHeader className="space-y-1 border-b border-border/60 bg-muted/20 px-5 pb-4 pt-5">
        <CardTitle className="font-display text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="p-4 sm:p-5">
        <div className="rounded-xl border border-border/70 bg-muted/15 p-2 sm:p-3">{children}</div>
      </CardContent>
    </Card>
  );
}
