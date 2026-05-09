import { MenuMediaThumb } from "@/components/shared/MenuMediaThumb";

type OrderTableVisualProps = {
  tableName?: string | null;
  tableId?: number | null;
  tableImage?: string | null;
  /** Smaller thumb for dense tables and list rows. */
  compact?: boolean;
};

/**
 * Table name/number with optional floor-plan photo from `GET /api/orders/` and client home.
 */
export function OrderTableVisual({ tableName, tableId, tableImage, compact = false }: OrderTableVisualProps) {
  const label = (tableName ?? "").trim() || (tableId != null ? `Table #${tableId}` : "");
  if (!label) {
    return <span className="text-text-muted">—</span>;
  }
  const thumbClass = compact
    ? "h-8 w-8 shrink-0 rounded-md border border-border"
    : "h-10 w-10 shrink-0 rounded-lg border border-border";
  return (
    <span className="inline-flex items-center gap-2 min-w-0 align-middle">
      <MenuMediaThumb mediaPath={tableImage ?? null} alt={label} className={thumbClass} />
      <span className="truncate font-medium text-foreground">{label}</span>
    </span>
  );
}
