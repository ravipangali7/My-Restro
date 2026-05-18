import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Layout helper for paginated list pages: optional header block, then list content.
 * Scrolling is handled by the portal `main` element (single scroll surface).
 */
export function ListPageShell({
  header,
  children,
  className,
  /** When true, list page fills the viewport height (used for dedicated list routes). */
  fillViewport = false,
}: {
  header?: ReactNode;
  children: ReactNode;
  className?: string;
  fillViewport?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col",
        fillViewport && "min-h-0 flex-1",
        className,
      )}
    >
      {header ? <div className="shrink-0 space-y-4">{header}</div> : null}
      <div className={cn("flex min-w-0 flex-col", fillViewport && "min-h-0 flex-1")}>{children}</div>
    </div>
  );
}
