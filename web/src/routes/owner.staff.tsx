import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { OwnerEntityCard, OwnerEntityCardStack, ownerListActionClass } from "@/components/owner/OwnerEntityCard";
import { RouteFormModal } from "@/components/shared/RouteFormModal";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useCreateOwnerStaffNotification, useOwnerStaffByRestaurant, useRestaurants } from "@/hooks/use-rest-api";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { STAFF_NOTIFICATION_LINK_OPTIONS, STAFF_PATH } from "@/lib/portal-routes";
import { Bell, MapPin, Plus, Users } from "lucide-react";

type StaffRow = {
  id: number;
  user: number;
  user_name?: string;
  user_phone?: string;
  restaurant?: number;
  restaurant_name?: string;
  role: string;
  joined_at: string;
  salary: string | number;
  salary_per_day: string | number;
  is_suspend: boolean;
};

type StaffRowResolved = StaffRow & { restaurant: number };

const ALL_KEY = "all" as const;

export const Route = createFileRoute("/owner/staff")({ component: StaffPage });

function StaffPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isBaseRoute = pathname === "/owner/staff";
  const isFormRoute = pathname === "/owner/staff/new";

  const { restaurantIds } = useRestaurantScope();
  const { data: restaurantsRaw = [] } = useRestaurants();
  const restaurants = restaurantsRaw as { id: number; name: string }[];
  const { sections, isPending } = useOwnerStaffByRestaurant();
  const createStaffNotif = useCreateOwnerStaffNotification();
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyRestaurantKey, setNotifyRestaurantKey] = useState<typeof ALL_KEY | number>(ALL_KEY);
  const [notifyRecipientStaffId, setNotifyRecipientStaffId] = useState<typeof ALL_KEY | number>(ALL_KEY);
  const [notifyChannel, setNotifyChannel] = useState<"app" | "sms">("app");
  const [notifyTitle, setNotifyTitle] = useState("");
  const [notifyMessage, setNotifyMessage] = useState("");
  const [notifyLinkPath, setNotifyLinkPath] = useState<string>(STAFF_PATH.home);
  const [notifyError, setNotifyError] = useState<string | null>(null);

  const restaurantLabel = (rid: number) => restaurants.find((r) => r.id === rid)?.name ?? `Restaurant #${rid}`;

  const allStaffRows: StaffRowResolved[] = useMemo(
    () =>
      sections.flatMap((sec) =>
        ((sec.staff as StaffRow[]) ?? []).map((s) => ({
          ...s,
          restaurant: s.restaurant ?? sec.restaurantId,
        })),
      ),
    [sections],
  );

  const notifyFilteredStaff = useMemo(() => {
    if (notifyRestaurantKey === ALL_KEY) return allStaffRows;
    return allStaffRows.filter((s) => s.restaurant === notifyRestaurantKey);
  }, [allStaffRows, notifyRestaurantKey]);

  useEffect(() => {
    setNotifyRecipientStaffId(ALL_KEY);
  }, [notifyRestaurantKey]);

  const goToStaff = (s: StaffRow) => {
    void navigate({ to: "/owner/staff/$id", params: { id: String(s.id) } });
  };

  const staffSubtitle = (s: StaffRow) => {
    if (restaurantIds.length > 1) {
      const venue = s.restaurant_name ?? (s.restaurant != null ? restaurantLabel(s.restaurant) : null);
      if (!venue) return <span className="text-text-muted">—</span>;
      return (
        <span className="inline-flex items-start gap-1.5">
          <MapPin size={14} className="mt-0.5 shrink-0 text-primary" aria-hidden />
          <span>{venue}</span>
        </span>
      );
    }
    const line = s.user_phone?.trim() || "Team member";
    return (
      <span className="inline-flex items-center gap-1.5">
        <MapPin size={14} className="shrink-0 text-primary" aria-hidden />
        <span>{line}</span>
      </span>
    );
  };

  const renderStaffCards = (list: StaffRow[]) => (
    <OwnerEntityCardStack>
      {list.map((s) => (
        <OwnerEntityCard
          key={s.id}
          onClick={() => goToStaff(s)}
          leading={
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Users strokeWidth={2} aria-hidden />
            </div>
          }
          title={s.user_name || `User #${s.user}`}
          subtitle={staffSubtitle(s)}
          meta={
            <>
              <StatusBadge status={s.role} />
              <StatusBadge status={s.is_suspend ? "inactive" : "active"} />
            </>
          }
          actions={
            <Link
              to="/owner/staff/$id"
              params={{ id: String(s.id) }}
              onClick={(e) => e.stopPropagation()}
              className={ownerListActionClass}
            >
              View profile
            </Link>
          }
        />
      ))}
    </OwnerEntityCardStack>
  );

  const restaurantOptions = useMemo(
    () =>
      restaurantIds.map((id) => ({
        id,
        name: restaurants.find((r) => r.id === id)?.name ?? `Restaurant #${id}`,
      })),
    [restaurantIds, restaurants],
  );

  const sortedNotifyStaff = useMemo(() => {
    return [...notifyFilteredStaff].sort((a, b) =>
      (a.user_name || `User #${a.user}`).localeCompare(b.user_name || `User #${b.user}`, undefined, {
        sensitivity: "base",
      }),
    );
  }, [notifyFilteredStaff]);

  const selectedRecipientRow =
    notifyRecipientStaffId === ALL_KEY
      ? null
      : (notifyFilteredStaff.find((s) => s.id === notifyRecipientStaffId) ?? null);

  const canSendNotify =
    notifyMessage.trim().length > 0 &&
    (notifyRecipientStaffId !== ALL_KEY ? selectedRecipientRow != null : notifyFilteredStaff.length > 0);

  const resetNotifyForm = () => {
    setNotifyRestaurantKey(ALL_KEY);
    setNotifyRecipientStaffId(ALL_KEY);
    setNotifyChannel("app");
    setNotifyTitle("");
    setNotifyMessage("");
    setNotifyLinkPath(STAFF_PATH.home);
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="font-display font-semibold text-lg text-foreground">Staff</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setNotifyError(null);
              resetNotifyForm();
              setNotifyOpen(true);
            }}
            disabled={restaurantIds.length === 0}
            className="h-10 px-4 rounded-xl border border-border bg-card text-foreground font-semibold text-sm hover:bg-accent/60 flex items-center gap-1.5 disabled:opacity-50"
          >
            <Bell size={14} /> Notify team
          </button>
          <Link
            to="/owner/staff/new"
            className="h-10 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary-600 flex items-center gap-1"
          >
            <Plus size={14} /> Add Staff
          </Link>
        </div>
      </div>
      {notifyOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Notify staff"
          onClick={() => setNotifyOpen(false)}
        >
          <div
            className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display font-semibold text-base text-foreground mb-1">Notify staff</h3>
            <p className="text-xs text-text-muted mb-4">
              Choose a restaurant to narrow the list, then send an app notification or SMS to all listed team members
              or to one person.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-text-secondary" htmlFor="staff-notif-restaurant">
                  Restaurant
                </label>
                <select
                  id="staff-notif-restaurant"
                  value={notifyRestaurantKey === ALL_KEY ? ALL_KEY : String(notifyRestaurantKey)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setNotifyRestaurantKey(v === ALL_KEY ? ALL_KEY : Number(v));
                  }}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value={ALL_KEY}>All</option>
                  {restaurantOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-text-secondary" htmlFor="staff-notif-recipient">
                  Send to
                </label>
                <select
                  id="staff-notif-recipient"
                  value={notifyRecipientStaffId === ALL_KEY ? ALL_KEY : String(notifyRecipientStaffId)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setNotifyRecipientStaffId(v === ALL_KEY ? ALL_KEY : Number(v));
                  }}
                  disabled={sortedNotifyStaff.length === 0}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
                >
                  <option value={ALL_KEY}>All</option>
                  {sortedNotifyStaff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.user_name || `User #${s.user}`}
                      {notifyRestaurantKey === ALL_KEY ? ` — ${restaurantLabel(s.restaurant)}` : ""}
                    </option>
                  ))}
                </select>
                {sortedNotifyStaff.length === 0 ? (
                  <p className="mt-1 text-xs text-text-muted">No staff for this restaurant selection.</p>
                ) : null}
              </div>
              <fieldset className="space-y-1.5">
                <legend className="text-xs font-medium text-text-secondary">Notification type</legend>
                <div className="flex flex-wrap gap-3 text-sm">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="staff-notif-type"
                      checked={notifyChannel === "app"}
                      onChange={() => setNotifyChannel("app")}
                      className="rounded-full border-border text-primary"
                    />
                    App Notification
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="staff-notif-type"
                      checked={notifyChannel === "sms"}
                      onChange={() => setNotifyChannel("sms")}
                      className="rounded-full border-border text-primary"
                    />
                    SMS
                  </label>
                </div>
              </fieldset>
              <div>
                <label className="text-xs font-medium text-text-secondary" htmlFor="staff-notif-title">
                  Title (optional)
                </label>
                <input
                  id="staff-notif-title"
                  value={notifyTitle}
                  onChange={(e) => setNotifyTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder="e.g. Shift change"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-text-secondary" htmlFor="staff-notif-message">
                  Message
                </label>
                <textarea
                  id="staff-notif-message"
                  value={notifyMessage}
                  onChange={(e) => setNotifyMessage(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-y min-h-[72px]"
                  placeholder="What should staff know?"
                  required
                />
              </div>
              {notifyChannel === "app" ? (
                <div>
                  <label className="text-xs font-medium text-text-secondary" htmlFor="staff-notif-link">
                    Opens when tapped
                  </label>
                  <select
                    id="staff-notif-link"
                    value={notifyLinkPath}
                    onChange={(e) => setNotifyLinkPath(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    {STAFF_NOTIFICATION_LINK_OPTIONS.map((opt) => (
                      <option key={opt.path} value={opt.path}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
            {notifyError ? <p className="mt-2 text-xs text-error">{notifyError}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNotifyOpen(false)}
                className="h-9 px-3 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent/50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={createStaffNotif.isPending || !canSendNotify}
                onClick={async () => {
                  setNotifyError(null);
                  const message = notifyMessage.trim();
                  const title = notifyTitle.trim() || undefined;
                  const link = notifyChannel === "app" ? notifyLinkPath.trim() || STAFF_PATH.home : "";
                  const type = notifyChannel === "sms" ? ("sms" as const) : ("push" as const);
                  const bodyBase = { message, title, link, type };

                  const postOne = (restaurant_id: number, receiver_user_ids?: number[]) =>
                    createStaffNotif.mutateAsync({
                      restaurant_id,
                      ...bodyBase,
                      ...(receiver_user_ids?.length ? { receiver_user_ids } : {}),
                    });

                  try {
                    if (selectedRecipientRow) {
                      await postOne(selectedRecipientRow.restaurant, [selectedRecipientRow.user]);
                    } else if (notifyRestaurantKey === ALL_KEY) {
                      for (const rid of restaurantIds) {
                        const hasStaff = allStaffRows.some((s) => s.restaurant === rid);
                        if (!hasStaff) continue;
                        await postOne(rid);
                      }
                    } else {
                      await postOne(notifyRestaurantKey);
                    }
                    setNotifyOpen(false);
                    resetNotifyForm();
                  } catch (e) {
                    setNotifyError(e instanceof Error ? e.message : "Could not send.");
                  }
                }}
                className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-600 disabled:opacity-50"
              >
                {createStaffNotif.isPending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {isPending ? (
        <p className="text-sm text-text-muted">Loading staff…</p>
      ) : restaurantIds.length === 0 ? (
        <p className="text-sm text-text-muted">No restaurants assigned.</p>
      ) : restaurantIds.length > 1 ? (
        <div className="space-y-8">
          {sections.map(({ restaurantId: rid, staff }) => (
            <section key={rid}>
              <h3 className="font-display font-semibold text-base text-foreground mb-3">{restaurantLabel(rid)}</h3>
              {(staff as StaffRow[]).length === 0 ? (
                <p className="text-sm text-text-muted">No staff at this restaurant.</p>
              ) : (
                renderStaffCards(staff as StaffRow[])
              )}
            </section>
          ))}
        </div>
      ) : (
        renderStaffCards((sections[0]?.staff as StaffRow[]) ?? [])
      )}
      {isFormRoute ? (
        <RouteFormModal title="Staff form" onClose={() => navigate({ to: "/owner/staff" })}>
          <Outlet />
        </RouteFormModal>
      ) : !isBaseRoute ? <Outlet /> : null}
    </>
  );
}
