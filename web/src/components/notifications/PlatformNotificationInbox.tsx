import { useEffect, useMemo, useReducer, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useAuth, type PortalRole } from "@/lib/auth-context";
import { useBulkNotifications } from "@/hooks/use-rest-api";
import { resolveMediaUrl } from "@/lib/api";
import { isStaffBulkNotificationRead, markStaffBulkNotificationRead, subscribeStaffBulkNotificationReads } from "@/lib/staff-bulk-notification-reads";
import { bulkNotificationNavigateTarget, portalHomeByRole, safeBulkNotificationTargetLink } from "@/lib/portal-routes";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { ApiBulkNotificationRow } from "@/lib/bulk-notification-types";
import { BulkNotificationCard, bulkNotificationTitle } from "@/components/notifications/BulkNotificationCard";

type Props = {
  /** e.g. "Platform announcements" under the title */
  subtitle?: string;
};

export function PlatformNotificationInbox({ subtitle = "Platform announcements" }: Props) {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const userId = user?.id;
  const { data: bulkRaw, isPending } = useBulkNotifications(null);

  const [bulkReadEpoch, bumpBulkReadEpoch] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribeStaffBulkNotificationReads(() => bumpBulkReadEpoch()), []);

  const apiRows = useMemo(() => ((bulkRaw as ApiBulkNotificationRow[] | undefined) ?? []).slice(0, 200), [bulkRaw]);

  const unreadCount = useMemo(() => {
    void bulkReadEpoch;
    if (userId == null) return 0;
    return apiRows.filter((r) => !isStaffBulkNotificationRead(userId, r.id)).length;
  }, [apiRows, userId, bulkReadEpoch]);

  const portalRole = role as PortalRole;
  const home = portalHomeByRole[portalRole] ?? "/";
  const notificationsPath = portalRole === "shareholder" ? "/shareholder/notifications" : "/customer/notifications";

  const [focusId, setFocusId] = useState<number | null>(null);

  const routeHash = useRouterState({
    select: (s) => {
      const h = s.location.hash;
      return h.startsWith("#") ? h.slice(1) : h;
    },
  });

  const detailRow = useMemo(
    () => (focusId != null ? (apiRows.find((r) => r.id === focusId) ?? null) : null),
    [apiRows, focusId],
  );

  useEffect(() => {
    if (!routeHash || !routeHash.startsWith("n-")) return;
    const m = /^n-(\d+)$/.exec(routeHash);
    if (!m) return;
    const id = Number(m[1]);
    if (Number.isNaN(id)) return;
    const row = apiRows.find((r) => r.id === id);
    if (!row) return;

    if (focusId !== id) {
      if (userId != null) markStaffBulkNotificationRead(userId, id);
      setFocusId(id);
    } else if (userId != null && !isStaffBulkNotificationRead(userId, id)) {
      markStaffBulkNotificationRead(userId, id);
    }
  }, [routeHash, apiRows, userId, focusId]);

  useEffect(() => {
    if (focusId == null) return;
    if (!apiRows.some((r) => r.id === focusId)) setFocusId(null);
  }, [apiRows, focusId]);

  useEffect(() => {
    if (!routeHash || !routeHash.startsWith("n-")) return;
    const el = document.getElementById(`inbox-${routeHash}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [routeHash, apiRows]);

  const closeDetail = () => {
    setFocusId(null);
    void navigate({ to: notificationsPath, hash: "", replace: true });
  };

  const openDetail = (notif: ApiBulkNotificationRow) => {
    if (userId != null) markStaffBulkNotificationRead(userId, notif.id);
    setFocusId(notif.id);
    void navigate({ to: notificationsPath, hash: `n-${notif.id}`, replace: true });
  };

  const detailImageUrl = detailRow ? resolveMediaUrl(detailRow.image ?? null) : null;

  const followFromDetail = () => {
    if (!detailRow) return;
    const nav = bulkNotificationNavigateTarget(detailRow.link, portalRole);
    setFocusId(null);
    void navigate({ to: nav.to, ...(nav.hash ? { hash: nav.hash } : {}), replace: true });
  };

  const showFollowLink = (() => {
    if (!detailRow) return false;
    const nav = bulkNotificationNavigateTarget(detailRow.link, portalRole);
    const selfHash = `n-${detailRow.id}`;
    if (nav.to === notificationsPath && (nav.hash === selfHash || !nav.hash)) return false;
    const resolved = safeBulkNotificationTargetLink(detailRow.link, portalRole);
    return resolved !== home;
  })();

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display font-semibold text-lg text-foreground">Notifications</h2>
          <p className="text-[11px] text-text-muted mt-0.5">{subtitle}</p>
        </div>
        <span className="text-xs text-text-muted">{unreadCount} unread</span>
      </div>

      {isPending && apiRows.length === 0 ? (
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
            const imgUrl = resolveMediaUrl(notif.image ?? null);
            return (
              <div
                key={notif.id}
                id={`inbox-n-${notif.id}`}
                className={`rounded-xl border transition-colors ${
                  read ? "bg-card border-border" : "bg-primary-50 border-primary/30"
                }`}
              >
                <button
                  type="button"
                  onClick={() => openDetail(notif)}
                  className="w-full text-left p-3 rounded-xl hover:bg-accent/40 transition-colors"
                >
                  <BulkNotificationCard
                    row={notif}
                    density="compact"
                    imageUrl={imgUrl}
                    showSourceLabel
                  />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={detailRow != null} onOpenChange={(open) => !open && closeDetail()}>
        <DialogContent className="max-w-[min(96vw,40rem)] w-full max-h-[92vh] p-0 gap-0 flex flex-col overflow-hidden border-border bg-card sm:rounded-xl">
          <DialogTitle className="sr-only">
            {detailRow ? bulkNotificationTitle(detailRow) : "Notification"}
          </DialogTitle>
          {detailRow ? (
            <>
              <div className="shrink-0 px-4 pt-5 pb-3 pr-12 border-b border-border">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-base font-semibold text-foreground leading-snug">{bulkNotificationTitle(detailRow)}</p>
                  {detailRow.restaurant == null ? (
                    <span className="text-[10px] text-primary font-medium shrink-0">Platform</span>
                  ) : null}
                </div>
                <p className="text-[11px] text-text-muted mt-1">{new Date(detailRow.created_at).toLocaleString()}</p>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-4">
                <p className="text-sm text-text-secondary whitespace-pre-wrap">{detailRow.message}</p>
                {detailImageUrl ? (
                  <div className="rounded-xl border border-border bg-surface-alt p-2 sm:p-3">
                    <div className="w-full flex justify-center items-start min-w-0">
                      <img
                        src={detailImageUrl}
                        alt="Bill"
                        className="max-w-full w-auto h-auto max-h-[min(78vh,960px)] object-contain object-top rounded-md"
                        loading="eager"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="shrink-0 border-t border-border px-4 py-3 flex flex-wrap gap-2 justify-end bg-surface-alt/40">
                {showFollowLink ? (
                  <button
                    type="button"
                    onClick={followFromDetail}
                    className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-95"
                  >
                    Open linked page
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
