import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useEffect, useMemo, useReducer } from "react";
import { useAuth } from "@/lib/auth-context";
import { useBulkNotifications } from "@/hooks/use-rest-api";
import {
  isStaffBulkNotificationRead,
  markStaffBulkNotificationRead,
  subscribeStaffBulkNotificationReads,
} from "@/lib/staff-bulk-notification-reads";
import type { ApiBulkNotificationRow } from "@/lib/bulk-notification-types";
import { ListPageShell, PaginatedList } from "@/components/shared/PaginatedList";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkNotificationCard } from "@/components/notifications/BulkNotificationCard";
import { resolveMediaUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/staff/notifications")({
  component: StaffNotificationsPage,
});

function StaffNotificationsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const restaurantId = user?.default_restaurant_id ?? null;
  const userId = user?.id;
  const { data: bulkRaw, isPending } = useBulkNotifications(restaurantId);
  const [bulkReadEpoch, bumpBulkReadEpoch] = useReducer((x: number) => x + 1, 0);

  useEffect(() => subscribeStaffBulkNotificationReads(() => bumpBulkReadEpoch()), []);

  const apiRows = useMemo(
    () => ((bulkRaw as ApiBulkNotificationRow[] | undefined) ?? []).slice(0, 200),
    [bulkRaw],
  );

  const unreadCount = useMemo(() => {
    void bulkReadEpoch;
    if (userId == null) return 0;
    return apiRows.filter((r) => !isStaffBulkNotificationRead(userId, r.id)).length;
  }, [apiRows, userId, bulkReadEpoch]);

  return (
    <>
      {restaurantId == null ? (
        <p className="text-sm text-text-muted">No restaurant context.</p>
      ) : isPending && apiRows.length === 0 ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : (
        <ListPageShell
          header={
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-semibold text-lg text-foreground">Notifications</h2>
              <span className="text-xs text-text-muted">{unreadCount} unread</span>
            </div>
          }
        >
        <PaginatedList
          items={apiRows}
          enablePagination
          enableSelection
          empty={
            <div className="rounded-xl border border-border bg-card p-6 text-center">
              <Bell className="mx-auto mb-2 text-text-muted" size={20} />
              <p className="text-sm text-text-muted">No notifications yet.</p>
            </div>
          }
          stackClassName="gap-2"
          renderItem={(notif, sel) => {
            const read = userId != null && isStaffBulkNotificationRead(userId, notif.id);
            const thumb = resolveMediaUrl(notif.image ?? null);
            return (
              <div
                className={cn(
                  "flex w-full items-stretch gap-2 rounded-xl border p-3 text-left transition-colors",
                  read ? "border-border bg-card" : "border-primary/30 bg-primary-50",
                  sel.selectable && sel.selected && "border-primary/40 ring-1 ring-primary/20",
                )}
              >
                {sel.selectable ? (
                  <div
                    className="flex shrink-0 items-start pt-0.5"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={sel.selected}
                      onCheckedChange={(c) => sel.onSelectedChange(c === true)}
                      aria-label="Select notification"
                    />
                  </div>
                ) : null}
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 rounded-lg"
                  onClick={() => {
                    if (userId != null) markStaffBulkNotificationRead(userId, notif.id);
                    void navigate({ to: "/staff/notifications/$id", params: { id: String(notif.id) } });
                  }}
                >
                  <BulkNotificationCard
                    row={notif}
                    density="compact"
                    imageUrl={thumb}
                    showSourceLabel={notif.restaurant == null}
                    isStaffViewer
                  />
                </button>
              </div>
            );
          }}
        />
        </ListPageShell>
      )}
    </>
  );
}
