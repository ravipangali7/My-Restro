import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { ArrowLeft, Bell } from "lucide-react";
import { useAuth, type PortalRole } from "@/lib/auth-context";
import { useBulkNotifications } from "@/hooks/use-rest-api";
import { resolveMediaUrl } from "@/lib/api";
import {
  isStaffBulkNotificationRead,
  markStaffBulkNotificationRead,
} from "@/lib/staff-bulk-notification-reads";
import type { ApiBulkNotificationRow } from "@/lib/bulk-notification-types";
import { bulkNotificationTitle } from "@/components/notifications/BulkNotificationCard";
import { bulkNotificationNavigateTarget, portalHomeByRole, safeBulkNotificationTargetLink } from "@/lib/portal-routes";

export const Route = createFileRoute("/staff/notifications_/$id")({ component: StaffNotificationViewPage });

function StaffNotificationViewPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const userId = user?.id;
  const restaurantId = user?.default_restaurant_id ?? null;
  const { data: bulkRaw, isPending } = useBulkNotifications(restaurantId);

  const apiRows = useMemo(() => ((bulkRaw as ApiBulkNotificationRow[] | undefined) ?? []).slice(0, 200), [bulkRaw]);

  const notif = useMemo(() => {
    const n = apiRows.find((r) => String(r.id) === id);
    return n ?? null;
  }, [apiRows, id]);

  useEffect(() => {
    if (userId == null || notif == null) return;
    if (!isStaffBulkNotificationRead(userId, notif.id)) {
      markStaffBulkNotificationRead(userId, notif.id);
    }
  }, [userId, notif]);

  const imageUrl = notif ? resolveMediaUrl(notif.image ?? null) : null;

  const staffRole = role === "waiter" || role === "cashier" || role === "kitchen" ? role : null;

  const showFollowLink = useMemo(() => {
    if (!notif || !staffRole) return false;
    const home = portalHomeByRole[staffRole];
    const resolved = safeBulkNotificationTargetLink(notif.link, staffRole as PortalRole);
    if (resolved === home) return false;
    const nav = bulkNotificationNavigateTarget(notif.link, staffRole as PortalRole);
    const selfPath = `/staff/notifications/${id}`;
    if (nav.to === selfPath) return false;
    return true;
  }, [notif, staffRole, id]);

  const followLinkedPage = () => {
    if (!notif || !staffRole) return;
    const nav = bulkNotificationNavigateTarget(notif.link, staffRole as PortalRole);
    void navigate({ to: nav.to, ...(nav.hash ? { hash: nav.hash } : {}) });
  };

  if (restaurantId == null) {
    return <p className="text-sm text-text-muted">No restaurant context.</p>;
  }

  if (isPending && !notif) {
    return <p className="text-sm text-text-muted">Loading…</p>;
  }

  if (!notif) {
    return (
      <>
        <Link
          to="/staff/notifications"
          className="flex items-center gap-1 text-sm text-text-secondary hover:text-foreground mb-4"
        >
          <ArrowLeft size={16} /> Back to notifications
        </Link>
        <p className="text-sm text-text-muted">This notification could not be found.</p>
      </>
    );
  }

  return (
    <>
      <Link
        to="/staff/notifications"
        className="flex items-center gap-1 text-sm text-text-secondary hover:text-foreground mb-4"
      >
        <ArrowLeft size={16} /> Back to notifications
      </Link>

      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
          <Bell size={24} className="text-primary" />
        </div>
        <div className="min-w-0">
          <h2 className="font-display font-bold text-xl text-foreground leading-snug">{bulkNotificationTitle(notif)}</h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <p className="text-[11px] text-text-muted">{new Date(notif.created_at).toLocaleString()}</p>
            {notif.restaurant == null ? (
              <span className="text-[10px] text-primary font-medium">Platform</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-4 space-y-4">
          <p className="text-sm text-text-secondary whitespace-pre-wrap">{notif.message}</p>
          {imageUrl ? (
            <div className="rounded-xl border border-border bg-surface-alt p-2 sm:p-3">
              <div className="w-full flex justify-center items-start min-w-0">
                <img
                  src={imageUrl}
                  alt=""
                  className="max-w-full w-auto h-auto max-h-[min(78vh,960px)] object-contain object-top rounded-md"
                  loading="eager"
                />
              </div>
            </div>
          ) : null}
        </div>
        {showFollowLink ? (
          <div className="border-t border-border px-4 py-3 flex flex-wrap gap-2 justify-end bg-surface-alt/40">
            <button
              type="button"
              onClick={followLinkedPage}
              className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-95"
            >
              Open linked page
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
