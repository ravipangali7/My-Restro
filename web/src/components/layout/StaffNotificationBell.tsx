import { Bell } from "lucide-react";
import { useEffect, useMemo, useReducer, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/lib/auth-context";
import { useBulkNotifications } from "@/hooks/use-rest-api";
import {
  isStaffBulkNotificationRead,
  markStaffBulkNotificationRead,
  subscribeStaffBulkNotificationReads,
} from "@/lib/staff-bulk-notification-reads";
import { bulkNotificationNavigateTarget, portalHomeByRole, safeBulkNotificationTargetLink } from "@/lib/portal-routes";
import { resolveMediaUrl } from "@/lib/api";
import {
  markOwnerNotificationRead,
  readOwnerNotifications,
  subscribeOwnerNotificationReads,
  type OwnerNotification,
} from "@/lib/owner-notifications";
import type { ApiBulkNotificationRow } from "@/lib/bulk-notification-types";
import { BulkNotificationCard } from "@/components/notifications/BulkNotificationCard";

type BellRow = { kind: "api"; row: ApiBulkNotificationRow } | { kind: "legacy"; row: OwnerNotification };

export function PortalNotificationBell() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const userId = user?.id;
  const isStaff = role === "waiter" || role === "cashier" || role === "kitchen";
  const isOwner = role === "owner";
  const isPlatformOnly = role === "customer" || role === "shareholder";

  const restaurantIdForQuery = isPlatformOnly ? null : (user?.default_restaurant_id ?? null);

  const { data, isPending, refetch } = useBulkNotifications(restaurantIdForQuery);
  const [open, setOpen] = useState(false);
  const [legacyOwner, setLegacyOwner] = useState<OwnerNotification[]>([]);
  /** Bumps when localStorage read map changes so unreadCount recomputes (dispatch fn is stable). */
  const [readEpoch, bumpReadEpoch] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribeStaffBulkNotificationReads(() => bumpReadEpoch()), []);

  useEffect(() => {
    if (!isOwner || typeof window === "undefined") {
      setLegacyOwner([]);
      return;
    }
    const refresh = () => setLegacyOwner(readOwnerNotifications(user?.default_restaurant_id ?? null));
    refresh();
    const unsub = subscribeOwnerNotificationReads(refresh);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      unsub();
      window.removeEventListener("focus", onFocus);
    };
  }, [isOwner, user?.default_restaurant_id]);

  const apiRows = useMemo(() => ((data as ApiBulkNotificationRow[] | undefined) ?? []).slice(0, 80), [data]);

  const combinedRows: BellRow[] = useMemo(() => {
    const apiPart: BellRow[] = apiRows.map((row) => ({ kind: "api" as const, row }));
    if (!isOwner || legacyOwner.length === 0) return apiPart;
    const legacyPart: BellRow[] = legacyOwner.slice(0, 40).map((row) => ({ kind: "legacy" as const, row }));
    return [...apiPart, ...legacyPart]
      .sort((a, b) => {
        const ta = a.kind === "api" ? a.row.created_at : a.row.createdAt;
        const tb = b.kind === "api" ? b.row.created_at : b.row.createdAt;
        return new Date(tb).getTime() - new Date(ta).getTime();
      })
      .slice(0, 80);
  }, [apiRows, isOwner, legacyOwner]);

  const unreadCount = useMemo(() => {
    void readEpoch; // localStorage read map changes do not alter other deps
    if (userId == null) return 0;
    let n = apiRows.filter((r) => !isStaffBulkNotificationRead(userId, r.id)).length;
    if (isOwner) {
      n += legacyOwner.filter((r) => !r.read).length;
    }
    return n;
  }, [apiRows, userId, isOwner, legacyOwner, readEpoch]);

  const needsRestaurant = !isPlatformOnly && restaurantIdForQuery == null;

  const headerSubtitle = isOwner
    ? "Restaurant and platform"
    : isStaff
      ? "Your restaurant and platform"
      : isPlatformOnly
        ? "Platform announcements"
        : "Updates";

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) void refetch();
  };

  const onSelectApi = (row: ApiBulkNotificationRow) => {
    if (userId == null) return;
    markStaffBulkNotificationRead(userId, row.id);
    setOpen(false);
    if (role === "owner") {
      void navigate({ to: "/owner/notifications/$id", params: { id: String(row.id) } });
      return;
    }
    if (isStaff) {
      void navigate({ to: "/staff/notifications/$id", params: { id: String(row.id) } });
      return;
    }
    const home = role ? portalHomeByRole[role] ?? "/" : "/";
    const resolved = safeBulkNotificationTargetLink(row.link, role);
    if (isPlatformOnly && resolved === home) {
      const inbox = role === "customer" ? "/customer/notifications" : "/shareholder/notifications";
      void navigate({ to: inbox });
      return;
    }
    const nav = bulkNotificationNavigateTarget(row.link, role);
    void navigate({ to: nav.to, ...(nav.hash ? { hash: nav.hash } : {}) });
  };

  const onSelectLegacy = (row: OwnerNotification) => {
    markOwnerNotificationRead(row.id);
    setOpen(false);
    void navigate({ to: row.to });
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative text-text-secondary hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded-md p-0.5"
          aria-label="Notifications"
        >
          <Bell size={20} />
          {unreadCount > 0 ? (
            <span className="absolute -top-2 -right-2 min-w-4 h-4 px-1 rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(100vw-2rem,22rem)] p-0 overflow-hidden">
        <div className="px-3 py-2 border-b border-border bg-surface-alt/80">
          <p className="text-sm font-semibold text-foreground">Notifications</p>
          <p className="text-[11px] text-text-muted">{headerSubtitle}</p>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {needsRestaurant ? (
            <p className="p-3 text-xs text-text-muted">No restaurant context.</p>
          ) : isPending ? (
            <p className="p-3 text-xs text-text-muted">Loading…</p>
          ) : combinedRows.length === 0 ? (
            <p className="p-3 text-xs text-text-muted">No notifications yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {combinedRows.map((item) => {
                if (item.kind === "legacy") {
                  const row = item.row;
                  const read = row.read;
                  return (
                    <li key={`legacy-${row.id}`}>
                      <button
                        type="button"
                        onClick={() => onSelectLegacy(row)}
                        className={`w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-accent/50 ${
                          read ? "bg-card" : "bg-primary-50/60"
                        }`}
                      >
                        <p className="font-semibold text-foreground leading-snug">{row.title}</p>
                        <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{row.message}</p>
                        <p className="text-[10px] text-text-muted mt-1">{new Date(row.createdAt).toLocaleString()}</p>
                      </button>
                    </li>
                  );
                }
                const row = item.row;
                const read = userId != null && isStaffBulkNotificationRead(userId, row.id);
                const thumb = resolveMediaUrl(row.image ?? null);
                return (
                  <li key={`api-${row.id}`}>
                    <button
                      type="button"
                      onClick={() => onSelectApi(row)}
                      className={`w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-accent/50 ${
                        read ? "bg-card" : "bg-primary-50/60"
                      }`}
                    >
                      <BulkNotificationCard
                        row={row}
                        density="compact"
                        imageUrl={thumb}
                        showSourceLabel={row.restaurant == null || isStaff}
                        isStaffViewer={isStaff}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {isOwner ? (
          <div className="border-t border-border px-3 py-2 bg-surface-alt/50">
            <Link
              to="/owner/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-primary hover:underline"
            >
              Open notifications page
            </Link>
          </div>
        ) : isStaff ? (
          <div className="border-t border-border px-3 py-2 bg-surface-alt/50">
            <Link
              to="/staff/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-primary hover:underline"
            >
              Open notifications page
            </Link>
          </div>
        ) : isPlatformOnly ? (
          <div className="border-t border-border px-3 py-2 bg-surface-alt/50">
            <Link
              to={role === "customer" ? "/customer/notifications" : "/shareholder/notifications"}
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-primary hover:underline"
            >
              Open notifications page
            </Link>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/** @deprecated Use PortalNotificationBell — alias kept for imports. */
export const StaffNotificationBell = PortalNotificationBell;
