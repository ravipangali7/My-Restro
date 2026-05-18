import { useEffect, useMemo, useState } from "react";

export const DEFAULT_PAGE_SIZE = 20;
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

export function getPageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | "ellipsis")[] = [1];
  if (current > 3) pages.push("ellipsis");
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let p = start; p <= end; p++) pages.push(p);
  if (current < total - 2) pages.push("ellipsis");
  pages.push(total);
  return pages;
}

export function usePaginatedList<T>(
  items: T[],
  options?: {
    pageSize?: number;
    /** When these change, reset to page 1 (e.g. tab filter). */
    resetDeps?: readonly unknown[];
  },
) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(options?.pageSize ?? DEFAULT_PAGE_SIZE);

  const resetKey = options?.resetDeps;
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when filter deps change
  }, resetKey ?? []);

  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalCount);

  return {
    pageItems,
    page,
    setPage,
    pageSize,
    setPageSize,
    totalCount,
    totalPages,
    rangeStart,
    rangeEnd,
    canPrev: page > 1,
    canNext: page < totalPages,
    goPrev: () => setPage((p) => Math.max(1, p - 1)),
    goNext: () => setPage((p) => Math.min(totalPages, p + 1)),
    pageNumbers: getPageNumbers(page, totalPages),
  };
}
