import type { ApiBulkNotificationRow } from "@/lib/bulk-notification-types";

type Density = "compact" | "comfortable";

type Props = {
  row: ApiBulkNotificationRow;
  density: Density;
  /** Resolved absolute URL for `row.image`, or null */
  imageUrl: string | null;
  /** Platform vs restaurant label in corner */
  showSourceLabel: boolean;
  /** When true, staff rows show "Restaurant" for restaurant-scoped items */
  isStaffViewer?: boolean;
  className?: string;
};

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function bulkNotificationTitle(row: ApiBulkNotificationRow) {
  return (row.title && row.title.trim()) || "Update";
}

export function BulkNotificationCard({
  row,
  density,
  imageUrl,
  showSourceLabel,
  isStaffViewer,
  className = "",
}: Props) {
  const title = bulkNotificationTitle(row);
  const source =
    row.restaurant == null ? (
      <span className="text-[10px] text-primary font-medium shrink-0">Platform</span>
    ) : isStaffViewer ? (
      <span className="text-[10px] text-text-muted shrink-0">Restaurant</span>
    ) : null;

  if (density === "compact") {
    return (
      <div className={`flex items-start gap-3 min-w-0 ${className}`}>
        {imageUrl ? (
          <div className="shrink-0 size-14 sm:size-[4.5rem] rounded-lg border border-border bg-surface-alt/80 overflow-hidden">
            <img
              src={imageUrl}
              alt="Attachment preview"
              className="size-full object-contain object-center p-1 bg-surface-alt"
              loading="lazy"
            />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-foreground leading-snug text-sm">{title}</p>
            {showSourceLabel ? source : null}
          </div>
          <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{row.message}</p>
          <p className="text-[11px] text-text-muted mt-1">{formatWhen(row.created_at)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {showSourceLabel ? source : null}
      </div>
      <p className="text-xs text-text-secondary mt-1">{row.message}</p>
      <p className="text-[11px] text-text-muted mt-1">{formatWhen(row.created_at)}</p>
      {imageUrl ? (
        <div className="mt-3 rounded-lg border border-border bg-surface-alt/80 overflow-hidden">
          <img
            src={imageUrl}
            alt="Bill preview"
            className="w-full max-h-72 object-contain object-top bg-surface-alt"
            loading="lazy"
          />
        </div>
      ) : null}
    </div>
  );
}
