import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Wraps a paginated list page so headers stay fixed, the list scrolls, and the pagination bar stays pinned.
 * Use with PaginatedList or PaginatedDataTable as the child.
 */
export function ListPageShell({
  header,
  children,
  className,
}: {
  header?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      {header ? <div className="shrink-0 space-y-4">{header}</div> : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
