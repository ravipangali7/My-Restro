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
import { BulkNotificationCard } from "@/components/notifications/BulkNotificationCard";
import { resolveMediaUrl } from "@/lib/api";

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
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-semibold text-lg text-foreground">Notifications</h2>
        <span className="text-xs text-text-muted">{unreadCount} unread</span>
      </div>

      {restaurantId == null ? (
        <p className="text-sm text-text-muted">No restaurant context.</p>
      ) : isPending && apiRows.length === 0 ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : apiRows.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-6 text-center">
          <Bell className="mx-auto text-text-muted mb-2" size={20} />
          <p className="text-sm text-text-muted">No notifications yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {apiRows.map((notif) => {
            const read = userId != null && isStaffBulkNotificationRead(userId, notif.id);
            const thumb = resolveMediaUrl(notif.image ?? null);
            return (
              <button
                key={notif.id}
                type="button"
                onClick={() => {
                  if (userId != null) markStaffBulkNotificationRead(userId, notif.id);
                  void navigate({ to: "/staff/notifications/$id", params: { id: String(notif.id) } });
                }}
                className={`w-full text-left rounded-xl border p-3 transition-colors ${
                  read ? "bg-card border-border" : "bg-primary-50 border-primary/30"
                }`}
              >
                <BulkNotificationCard
                  row={notif}
                  density="compact"
                  imageUrl={thumb}
                  showSourceLabel={notif.restaurant == null}
                  isStaffViewer
                />
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
