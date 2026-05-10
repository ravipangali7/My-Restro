import type { ReactNode } from "react";

interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => ReactNode);
  className?: string;
  /** Hide on small screens (still shown in the desktop table). */
  mobileHidden?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
}

export function DataTable<T extends { id: string | number }>({ columns, data, onRowClick }: DataTableProps<T>) {
  const mobileColumns = columns.filter((c) => !c.mobileHidden);

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Desktop Table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-surface">
              {columns.map((col, i) => (
                <th key={i} className={`px-4 py-3 text-left text-xs font-semibold uppercase text-text-secondary tracking-wider ${col.className || ""}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={row.id}
                className="border-t border-border hover:bg-primary-50/50 transition-colors cursor-pointer"
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col, i) => (
                  <td key={i} className={`px-4 py-3 text-sm text-foreground ${col.className || ""}`}>
                    {typeof col.accessor === "function"
                      ? col.accessor(row)
                      : (row[col.accessor] as ReactNode)}
                  </td>
                ))}
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-text-muted text-sm">
                  No data found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile list: only non-hidden columns; tappable when onRowClick is set */}
      <div className="lg:hidden divide-y divide-border">
        {data.map((row) => (
          <div
            key={row.id}
            className={`p-4 space-y-2 ${onRowClick ? "cursor-pointer active:bg-primary-50/50" : "active:bg-primary-50/50"}`}
            onClick={() => onRowClick?.(row)}
            role={onRowClick ? "button" : undefined}
          >
            {mobileColumns.map((col, i) => (
              <div key={i} className="flex justify-between items-start gap-3">
                <span className="text-xs text-text-muted font-medium shrink-0">{col.header}</span>
                <span className="text-sm text-foreground text-right min-w-0 break-words">
                  {typeof col.accessor === "function"
                    ? col.accessor(row)
                    : (row[col.accessor] as ReactNode)}
                </span>
              </div>
            ))}
          </div>
        ))}
        {data.length === 0 && (
          <div className="p-8 text-center text-text-muted text-sm">No data found.</div>
        )}
      </div>
    </div>
  );
}
