import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useEffect, useMemo, useReducer, useState } from "react";
import {
  markOwnerNotificationRead,
  readOwnerNotifications,
  subscribeOwnerNotificationReads,
  type OwnerNotification,
} from "@/lib/owner-notifications";
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
import { resolveMediaUrl } from "@/lib/api";

export const Route = createFileRoute("/owner/notifications")({
  component: OwnerNotificationsPage,
});

type Row = { kind: "api"; row: ApiBulkNotificationRow } | { kind: "legacy"; row: OwnerNotification };

type PaginatedRow = Row & { id: string };

function OwnerNotificationsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const restaurantId = user?.default_restaurant_id ?? null;
  const userId = user?.id;
  const { data: bulkRaw, isPending } = useBulkNotifications(restaurantId);
  const [legacy, setLegacy] = useState<OwnerNotification[]>([]);
  /** Forces re-render when bulk read state changes elsewhere (e.g. header bell). */
  const [bulkReadEpoch, bumpBulkReadEpoch] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    const refreshLegacy = () => setLegacy(readOwnerNotifications(restaurantId));
    refreshLegacy();
    window.addEventListener("focus", refreshLegacy);
    const unsubOwner = subscribeOwnerNotificationReads(refreshLegacy);
    const unsubBulk = subscribeStaffBulkNotificationReads(() => bumpBulkReadEpoch());
    return () => {
      window.removeEventListener("focus", refreshLegacy);
      unsubOwner();
      unsubBulk();
    };
  }, [restaurantId]);

  const apiRows = useMemo(
    () => ((bulkRaw as ApiBulkNotificationRow[] | undefined) ?? []).slice(0, 200),
    [bulkRaw],
  );

  const rows: PaginatedRow[] = useMemo(() => {
    const apiPart: PaginatedRow[] = apiRows.map((row) => ({
      kind: "api" as const,
      row,
      id: `api-${row.id}`,
    }));
    const legacyPart: PaginatedRow[] = legacy.map((row) => ({
      kind: "legacy" as const,
      row,
      id: `legacy-${row.id}`,
    }));
    return [...apiPart, ...legacyPart].sort((a, b) => {
      const ta = a.kind === "api" ? a.row.created_at : a.row.createdAt;
      const tb = b.kind === "api" ? b.row.created_at : b.row.createdAt;
      return new Date(tb).getTime() - new Date(ta).getTime();
    });
  }, [apiRows, legacy]);

  const unreadCount = useMemo(() => {
    void bulkReadEpoch;
    if (userId == null) return 0;
    let n = apiRows.filter((r) => !isStaffBulkNotificationRead(userId, r.id)).length;
    n += legacy.filter((r) => !r.read).length;
    return n;
  }, [apiRows, userId, legacy, bulkReadEpoch]);

  return (
    <>
      {restaurantId == null ? (
        <p className="text-sm text-text-muted">No restaurant selected.</p>
      ) : (
        <ListPageShell
          header={
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-semibold text-lg text-foreground">Notifications</h2>
              <span className="text-xs text-text-muted">{unreadCount} unread</span>
            </div>
          }
        >
          {isPending && rows.length === 0 ? (
            <p className="text-sm text-text-muted">Loading…</p>
          ) : (
            <PaginatedList
              items={rows}
              stackClassName="gap-2"
              empty={
                <div className="bg-card rounded-xl border border-border p-6 text-center">
                  <Bell className="mx-auto text-text-muted mb-2" size={20} />
                  <p className="text-sm text-text-muted">No notifications yet.</p>
                </div>
              }
              renderItem={(item, sel) => {
            if (item.kind === "legacy") {
              const notif = item.row;
              return (
                <div
                  className={`flex gap-3 rounded-xl border p-3 transition-colors ${
                    notif.read ? "bg-card border-border" : "bg-primary-50 border-primary/30"
                  } ${sel.selectable && sel.selected ? "ring-1 ring-primary/30" : ""}`}
                >
                  {sel.selectable ? (
                    <div className="flex shrink-0 items-start pt-0.5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={sel.selected}
                        onCheckedChange={(v) => sel.onSelectedChange(v === true)}
                        aria-label="Select notification"
                      />
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      markOwnerNotificationRead(notif.id);
                      void navigate({ to: notif.to });
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="text-sm font-semibold text-foreground">{notif.title}</p>
                    <p className="text-xs text-text-secondary mt-1">{notif.message}</p>
                    <p className="text-[11px] text-text-muted mt-1">{new Date(notif.createdAt).toLocaleString()}</p>
                  </button>
                </div>
              );
            }
            const notif = item.row;
            const read = userId != null && isStaffBulkNotificationRead(userId, notif.id);
            const thumb = resolveMediaUrl(notif.image ?? null);
            return (
              <div
                className={`flex gap-3 rounded-xl border p-3 transition-colors ${
                  read ? "bg-card border-border" : "bg-primary-50 border-primary/30"
                } ${sel.selectable && sel.selected ? "ring-1 ring-primary/30" : ""}`}
              >
                {sel.selectable ? (
                  <div className="flex shrink-0 items-start pt-0.5" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={sel.selected}
                      onCheckedChange={(v) => sel.onSelectedChange(v === true)}
                      aria-label="Select notification"
                    />
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    if (userId != null) markStaffBulkNotificationRead(userId, notif.id);
                    void navigate({ to: "/owner/notifications/$id", params: { id: String(notif.id) } });
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <BulkNotificationCard
                    row={notif}
                    density="compact"
                    imageUrl={thumb}
                    showSourceLabel
                    isStaffViewer={false}
                  />
                </button>
              </div>
            );
          }}
        />
          )}
        </ListPageShell>
      )}
    </>
  );
}
