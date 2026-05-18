import type { DependencyList, ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { OwnerEntityCardStack } from "@/components/owner/OwnerEntityCard";
import { usePaginatedList } from "@/hooks/use-paginated-list";
import { useListSelection, type ListItemId, type ListItemSelectionProps } from "@/hooks/use-list-selection";
import { ListPaginationBar } from "@/components/shared/ListPaginationBar";
import { cn } from "@/lib/utils";

export {
  GroupedListSections,
  ListPageShell,
  ownerEntityCardGridClass,
} from "@/components/shared/ListPageShell";
export type { GroupedListSectionItem } from "@/components/shared/ListPageShell";
export type { ListItemSelectionProps };

export interface PaginatedListProps<T extends { id: ListItemId }> {
  items: T[];
  /** Reset to page 1 when filters change (e.g. active tab). Only applies when `enablePagination` is true. */
  resetDeps?: DependencyList;
  empty?: ReactNode;
  className?: string;
  stackClassName?: string;
  enablePagination?: boolean;
  enableSelection?: boolean;
  /** Extra controls shown when items are selected (e.g. bulk delete). */
  selectionActions?: (ctx: { selectedIds: ListItemId[]; clearSelection: () => void }) => ReactNode;
  renderItem: (item: T, selection: ListItemSelectionProps | { selectable?: false }) => ReactNode;
}

export function PaginatedList<T extends { id: ListItemId }>({
  items,
  resetDeps,
  empty,
  className,
  stackClassName,
  enablePagination = false,
  enableSelection = false,
  selectionActions,
  renderItem,
}: PaginatedListProps<T>) {
  const pagination = usePaginatedList(items, {
    resetDeps: enablePagination ? resetDeps : [],
    pageSize: enablePagination ? undefined : Math.max(items.length, 1),
  });
  const displayItems = enablePagination ? pagination.pageItems : items;
  const selection = useListSelection(enableSelection ? displayItems : []);

  if (items.length === 0) {
    return empty ? <>{empty}</> : null;
  }

  const showToolbar = enableSelection && displayItems.length > 0;

  return (
    <div data-paginated-list-root className={cn("flex min-w-0 flex-col gap-3", className)}>
      {showToolbar ? (
        <ListSelectionToolbar
          selectedCount={selection.selectedCount}
          allOnPageSelected={selection.allOnPageSelected}
          selectAllIndeterminate={selection.selectAllIndeterminate}
          onToggleSelectAll={selection.toggleSelectAllOnPage}
          pageCount={displayItems.length}
          className="mb-0 shrink-0"
          actions={
            selection.selectedCount > 0 && selectionActions
              ? selectionActions({
                  selectedIds: selection.selectedIds,
                  clearSelection: selection.clearSelection,
                })
              : null
          }
        />
      ) : null}

      <OwnerEntityCardStack className={stackClassName}>
        {displayItems.map((item) => {
          const selectionProps: ListItemSelectionProps | { selectable?: false } = enableSelection
            ? {
                selectable: true,
                selected: selection.isSelected(item.id),
                onSelectedChange: (checked) => selection.toggle(item.id, checked),
              }
            : { selectable: false };
          return <div key={item.id}>{renderItem(item, selectionProps)}</div>;
        })}
      </OwnerEntityCardStack>

      {enablePagination ? (
        <ListPaginationBar
          sticky
          page={pagination.page}
          totalPages={pagination.totalPages}
          totalCount={pagination.totalCount}
          rangeStart={pagination.rangeStart}
          rangeEnd={pagination.rangeEnd}
          pageSize={pagination.pageSize}
          pageNumbers={pagination.pageNumbers}
          canPrev={pagination.canPrev}
          canNext={pagination.canNext}
          onPageChange={pagination.setPage}
          onPrev={pagination.goPrev}
          onNext={pagination.goNext}
          onPageSizeChange={(size) => {
            pagination.setPageSize(size);
            pagination.setPage(1);
          }}
        />
      ) : null}
    </div>
  );
}

export function ListSelectionToolbar({
  selectedCount,
  allOnPageSelected,
  selectAllIndeterminate,
  onToggleSelectAll,
  pageCount,
  actions,
  className,
}: {
  selectedCount: number;
  allOnPageSelected: boolean;
  selectAllIndeterminate: boolean;
  onToggleSelectAll: () => void;
  pageCount: number;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2.5 sm:px-4",
        className,
      )}
    >
      <label className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
        <Checkbox
          checked={selectAllIndeterminate ? "indeterminate" : allOnPageSelected}
          onCheckedChange={() => onToggleSelectAll()}
          aria-label="Select all on this page"
        />
        <span>
          Select all on page
          <span className="ml-1 text-text-muted">({pageCount})</span>
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
        {selectedCount > 0 ? (
          <span className="font-semibold text-primary">{selectedCount} selected</span>
        ) : (
          <span>None selected</span>
        )}
        {actions}
      </div>
    </div>
  );
}
