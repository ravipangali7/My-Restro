import { cn } from "@/lib/utils";
import { PAGE_SIZE_OPTIONS } from "@/hooks/use-paginated-list";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

export interface ListPaginationBarProps {
  page: number;
  totalPages: number;
  totalCount: number;
  rangeStart: number;
  rangeEnd: number;
  pageSize: number;
  pageNumbers: (number | "ellipsis")[];
  canPrev: boolean;
  canNext: boolean;
  onPageChange: (page: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onPageSizeChange: (size: number) => void;
  className?: string;
  /** Pin bar at bottom of list panel (no outer page scroll). */
  fixed?: boolean;
}

export function ListPaginationBar({
  page,
  totalPages,
  totalCount,
  rangeStart,
  rangeEnd,
  pageSize,
  pageNumbers,
  canPrev,
  canNext,
  onPageChange,
  onPrev,
  onNext,
  onPageSizeChange,
  className,
  fixed = false,
}: ListPaginationBarProps) {
  if (totalCount === 0) return null;

  return (
    <nav
      aria-label="List pagination"
      className={cn(
        "flex flex-col gap-3 border border-border bg-card px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4",
        fixed
          ? "mt-0 shrink-0 rounded-2xl border-t shadow-[0_-4px_16px_rgba(0,0,0,0.06)]"
          : "mt-4 rounded-2xl",
        className,
      )}
    >
      <p className="text-center text-xs text-text-muted sm:text-left">
        Showing <span className="font-semibold text-foreground">{rangeStart}</span>
        {" – "}
        <span className="font-semibold text-foreground">{rangeEnd}</span> of{" "}
        <span className="font-semibold text-foreground">{totalCount}</span>
      </p>

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span className="whitespace-nowrap">Per page</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-9 rounded-lg border border-border bg-card px-2 text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            aria-label="Items per page"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <Pagination className="mx-0 w-auto justify-center">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (canPrev) onPrev();
                }}
                className={cn(!canPrev && "pointer-events-none opacity-40")}
                aria-disabled={!canPrev}
              />
            </PaginationItem>
            {pageNumbers.map((p, i) =>
              p === "ellipsis" ? (
                <PaginationItem key={`ellipsis-${i}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={p}>
                  <PaginationLink
                    href="#"
                    isActive={p === page}
                    onClick={(e) => {
                      e.preventDefault();
                      onPageChange(p);
                    }}
                  >
                    {p}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (canNext) onNext();
                }}
                className={cn(!canNext && "pointer-events-none opacity-40")}
                aria-disabled={!canNext}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </nav>
  );
}
