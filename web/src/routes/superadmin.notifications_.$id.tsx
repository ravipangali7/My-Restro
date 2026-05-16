import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ViewField, ViewSection } from "@/components/shared/ViewField";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useBulkNotifications, useRestaurants, useUsers } from "@/hooks/use-rest-api";
import { resolveMediaUrl } from "@/lib/api";
import { ArrowLeft, Bell } from "lucide-react";

export const Route = createFileRoute("/superadmin/notifications_/$id")({ component: NotificationViewPage });

function NotificationViewPage() {
  const { id } = Route.useParams();
  const { data: bulkList } = useBulkNotifications(null);
  const { data: restaurants } = useRestaurants();
  const { data: users } = useUsers();

  const notif = useMemo(() => {
    const list = (bulkList as { id: number }[] | undefined) ?? [];
    return list.find((n) => String(n.id) === id);
  }, [bulkList, id]);

  const restaurant = useMemo(() => {
    const rid = (notif as { restaurant?: number | null } | undefined)?.restaurant;
    if (rid == null) return undefined;
    return (restaurants as { id: number; name: string }[] | undefined)?.find((r) => r.id === rid);
  }, [notif, restaurants]);

  const resolveReceiver = (rid: string | number) => {
    const s = String(rid);
    const byPhone = (users as { id: number; phone: string; name: string }[] | undefined)?.find((u) => u.phone === s);
    if (byPhone) return { name: byPhone.name, phone: byPhone.phone };
    const byId = (users as { id: number; phone: string; name: string }[] | undefined)?.find((u) => String(u.id) === s);
    if (byId) return { name: byId.name, phone: byId.phone };
    return { name: s, phone: "" };
  };

  if (!notif) {
    return <p className="text-sm text-text-muted">Notification not found.</p>;
  }

  const n = notif as {
    message: string;
    type: string;
    receivers: unknown[];
    restaurant?: number | null;
    restaurant_name?: string;
    image?: string | null;
  };

  const receivers = Array.isArray(n.receivers) ? n.receivers : [];
  const isPlatform = n.restaurant == null;
  const imageUrl = n.type === "push" ? resolveMediaUrl(n.image ?? null) : null;

  return (
    <>
      <Link to="/superadmin/notifications" className="flex items-center gap-1 text-sm text-text-secondary hover:text-foreground mb-4">
        <ArrowLeft size={16} /> Back to Notifications
      </Link>

      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center">
          <Bell size={24} className="text-primary" />
        </div>
        <div>
          <h2 className="font-display font-bold text-xl text-foreground">Notification Details</h2>
          <StatusBadge status={n.type} />
        </div>
      </div>

      <ViewSection title="Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ViewField label="Type" value={<StatusBadge status={n.type} />} />
          <ViewField label="Restaurant" value={n.restaurant_name ?? restaurant?.name ?? "—"} />
        </div>
      </ViewSection>

      <ViewSection title="Message">
        <div className="bg-card rounded-xl border border-border p-4 space-y-4">
          <p className="text-sm text-foreground whitespace-pre-wrap">{n.message}</p>
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
      </ViewSection>

      <ViewSection
        title={
          receivers.length === 0 && isPlatform
            ? "Receivers"
            : `Receivers (${receivers.length})`
        }
      >
        {receivers.length === 0 && isPlatform ? (
          <p className="text-sm text-foreground">
            Everyone on the platform (owners, staff, customers, and shareholders); super admins excluded.
          </p>
        ) : receivers.length === 0 ? (
          <p className="text-sm text-foreground">Everyone on the team at this restaurant.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {receivers.map((rid, i) => {
              const { name, phone } = resolveReceiver(rid as string | number);
              return (
                <span
                  key={i}
                  className="px-3 py-1.5 rounded-xl bg-surface-alt text-sm font-medium text-foreground border border-border"
                >
                  {name} {phone ? <span className="text-xs text-text-muted ml-1">{phone}</span> : null}
                </span>
              );
            })}
          </div>
        )}
      </ViewSection>
    </>
  );
}
