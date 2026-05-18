import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Responsive grid for owner portal entity card lists. */
export const ownerEntityCardGridClass =
  "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4";

export type GroupedListSectionItem = {
  key: string | number;
  title?: ReactNode;
  children: ReactNode;
};

/**
 * Stack grouped list sections (e.g. per restaurant) without nested flex height
 * splitting — avoids overlapping cards when many sections scroll in `main`.
 */
export function GroupedListSections({
  sections,
  className,
}: {
  sections: GroupedListSectionItem[];
  className?: string;
}) {
  return (
    <div className={cn("flex w-full flex-col gap-10", className)}>
      {sections.map(({ key, title, children }) => (
        <section key={key} className="w-full space-y-4">
          {title != null ? (
            typeof title === "string" ? (
              <h3 className="border-b border-border pb-2 font-display text-base font-semibold text-foreground">
                {title}
              </h3>
            ) : (
              title
            )
          ) : null}
          {children}
        </section>
      ))}
    </div>
  );
}

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
