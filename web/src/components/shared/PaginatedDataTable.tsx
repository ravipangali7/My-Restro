import type { DependencyList, ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/shared/DataTable";
import { usePaginatedList } from "@/hooks/use-paginated-list";
import { useListSelection, type ListItemId } from "@/hooks/use-list-selection";
import { ListPaginationBar } from "@/components/shared/ListPaginationBar";
import { ListSelectionToolbar } from "@/components/shared/PaginatedList";
import { cn } from "@/lib/utils";

type Column<T> = {
  header: string;
  accessor: keyof T | ((row: T) => ReactNode);
  className?: string;
  mobileHidden?: boolean;
};

export interface PaginatedDataTableProps<T extends { id: ListItemId }> {
  columns: Column<T>[];
  data: T[];
  resetDeps?: DependencyList;
  onRowClick?: (row: T) => void;
  enablePagination?: boolean;
  enableSelection?: boolean;
  selectionActions?: (ctx: { selectedIds: ListItemId[]; clearSelection: () => void }) => ReactNode;
  emptyMessage?: string;
  className?: string;
}

export function PaginatedDataTable<T extends { id: ListItemId }>({
  columns,
  data,
  resetDeps,
  onRowClick,
  enablePagination = false,
  enableSelection = false,
  selectionActions,
  emptyMessage = "No data found.",
  className,
}: PaginatedDataTableProps<T>) {
  const pagination = usePaginatedList(data, {
    resetDeps: enablePagination ? resetDeps : [],
    pageSize: enablePagination ? undefined : Math.max(data.length, 1),
  });
  const displayRows = enablePagination ? pagination.pageItems : data;
  const selection = useListSelection(enableSelection ? displayRows : []);

  const selectionColumn: Column<T> = {
    header: "",
    className: "w-10",
    accessor: (row) =>
      enableSelection ? (
        <Checkbox
          checked={selection.isSelected(row.id)}
          onCheckedChange={(v) => selection.toggle(row.id, v === true)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Select row"
        />
      ) : null,
  };

  const tableColumns = enableSelection ? [selectionColumn, ...columns] : columns;

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-text-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div data-paginated-list-root className={cn("flex min-w-0 flex-col gap-3", className)}>
      {enableSelection && displayRows.length > 0 ? (
        <ListSelectionToolbar
          selectedCount={selection.selectedCount}
          allOnPageSelected={selection.allOnPageSelected}
          selectAllIndeterminate={selection.selectAllIndeterminate}
          onToggleSelectAll={selection.toggleSelectAllOnPage}
          pageCount={displayRows.length}
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

      <DataTable columns={tableColumns} data={displayRows} onRowClick={onRowClick} />

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
