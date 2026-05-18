import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LocationMapPicker } from "@/components/shared/LocationMapPicker";
import {
  OwnerEntityCard,
  ownerListActionClass,
  ownerListActionDangerClass,
} from "@/components/owner/OwnerEntityCard";
import { PaginatedList } from "@/components/shared/PaginatedList";
import { SuperAdminEmptyState, SuperAdminPageHeader } from "@/components/superadmin/super-admin-ui";
import { AppModal } from "@/components/shared/AppModal";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { useRestaurants, useSuperSettings, useUsers } from "@/hooks/use-rest-api";
import { apiDelete, apiPatch, apiPatchForm, apiPostForm, resolveMediaUrl } from "@/lib/api";
import type { SuperSettingsDTO } from "@/lib/super-settings-cache";
import { parseLocalPhone } from "@/lib/phone-validation";
import { slugifyName } from "@/lib/slugify";
import { useAuth } from "@/lib/auth-context";
import { Plus, Store } from "lucide-react";

type R = {
  id: number;
  user: number;
  name: string;
  phone: string;
  slug: string;
  logo?: string | null;
  subscription_start?: string;
  subscription_end?: string;
  due_balance: number;
  is_open: boolean;
  per_transaction_fee: number;
  subscription_fee_per_month?: number | string | null;
  sms_per_usage?: number | string | null;
  due_threshold?: number | string | null;
  can_delivery: boolean;
  delivery_radius_km?: number;
  address?: string;
  latitude?: number;
  longitude?: number;
  is_active?: boolean;
};

function toDateInputValue(v: string | null | undefined): string {
  if (v == null || v === "") return "";
  const s = String(v).trim();
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function toNum(v: string | number | undefined): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function syncRestaurantsListAfterUpsert(queryClient: QueryClient, row: R) {
  queryClient.setQueriesData<R[]>({ queryKey: ["restaurants"] }, (old) => {
    const prev = Array.isArray(old) ? old : [];
    const i = prev.findIndex((x) => x.id === row.id);
    if (i >= 0) {
      const next = [...prev];
      next[i] = row;
      return next;
    }
    return [row, ...prev];
  });
  return queryClient.refetchQueries({ queryKey: ["restaurants"] });
}

export const Route = createFileRoute("/superadmin/restaurants")({ component: RestaurantsPage });

function RestaurantsPage() {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const { data: restaurants, isLoading } = useRestaurants();
  const { data: users } = useUsers();
  const { data: superSettings } = useSuperSettings();
  const platformDefaults = superSettings as SuperSettingsDTO | undefined;

  const [showForm, setShowForm] = useState(false);
  const [editRestaurant, setEditRestaurant] = useState<R | null>(null);
  const { requestConfirm, ConfirmDialog } = useConfirmAction();
  const [formLat, setFormLat] = useState("");
  const [formLng, setFormLng] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formIsOpen, setFormIsOpen] = useState(true);
  const [formCanDelivery, setFormCanDelivery] = useState(false);
  const [formDeliveryRadiusKm, setFormDeliveryRadiusKm] = useState("50");
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState("");
  const [restaurantSlug, setRestaurantSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [restaurantPhone, setRestaurantPhone] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [approveBusy, setApproveBusy] = useState(false);

  const isSuperAdmin = user?.role === "super_admin";
  const editNeedsApproval = Boolean(isSuperAdmin && editRestaurant && editRestaurant.is_active === false);

  useEffect(() => {
    if (!showForm) return;
    setFormLat(editRestaurant?.latitude != null ? String(editRestaurant.latitude) : "");
    setFormLng(editRestaurant?.longitude != null ? String(editRestaurant.longitude) : "");
    setFormAddress(editRestaurant?.address ?? "");
    setFormIsOpen(editRestaurant?.is_open !== false);
    setFormCanDelivery(Boolean(editRestaurant?.can_delivery));
    setFormDeliveryRadiusKm(
      editRestaurant?.delivery_radius_km != null ? String(editRestaurant.delivery_radius_km) : "50",
    );
    setSubmitError(null);
    setRestaurantName(editRestaurant?.name ?? "");
    setRestaurantSlug(editRestaurant?.slug ?? "");
    setSlugTouched(Boolean(editRestaurant));
    setRestaurantPhone(editRestaurant?.phone ?? "");
  }, [showForm, editRestaurant]);

  const rows = (restaurants as R[] | undefined) ?? [];

  const ownerName = (uid: number) =>
    (users as { id: number; name: string }[] | undefined)?.find((u) => u.id === uid)?.name ?? "—";

  const openAdd = () => {
    setEditRestaurant(null);
    setFormIsOpen(true);
    setFormCanDelivery(false);
    setFormDeliveryRadiusKm("50");
    setSubmitError(null);
    setShowForm(true);
  };
  const openEdit = (r: R) => {
    setEditRestaurant(r);
    setShowForm(true);
  };

  if (isLoading) {
    return <p className="text-sm text-text-muted">Loading…</p>;
  }

  return (
    <>
      <SuperAdminPageHeader
        title="Restaurants"
        description="Locations, billing, subscription windows, and activation status for every venue on the platform."
        actions={
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-600"
          >
            <Plus size={14} aria-hidden /> Add restaurant
          </button>
        }
      />
      <PaginatedList
        items={rows}
        enablePagination
        empty={<SuperAdminEmptyState>No restaurants yet.</SuperAdminEmptyState>}
        renderItem={(r) => {
            const logoSrc = resolveMediaUrl(r.logo);
            return (
              <OwnerEntityCard
                onClick={() => {
                  void navigate({ to: "/superadmin/restaurants/$id", params: { id: String(r.id) } });
                }}
                leading={
                  logoSrc ? (
                    <img
                      src={logoSrc}
                      alt=""
                      className="h-12 w-12 rounded-xl border border-border bg-surface object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/10 text-teal-700">
                      <Store strokeWidth={2} aria-hidden />
                    </div>
                  )
                }
                title={r.name}
                subtitle={
                  <span className="line-clamp-2 text-text-secondary">
                    <span className="font-medium text-foreground">{ownerName(r.user)}</span>
                    <span className="text-text-muted"> · </span>
                    {r.phone}
                    <span className="text-text-muted"> · </span>/{r.slug}
                  </span>
                }
                meta={
                  <>
                    {r.is_active === false ? <StatusBadge status="pending" /> : <StatusBadge status="active" />}
                    <StatusBadge status={r.is_open ? "open" : "closed"} />
                    <span className="text-xs font-medium text-text-secondary">
                      Due ₹{Number(r.due_balance).toLocaleString()}
                    </span>
                    <span className="text-xs text-text-muted">
                      {r.subscription_start ?? "—"} — {r.subscription_end ?? "—"}
                    </span>
                  </>
                }
                actions={
                  <>
                    <Link
                      to="/superadmin/restaurants/$id"
                      params={{ id: String(r.id) }}
                      onClick={(e) => e.stopPropagation()}
                      className={ownerListActionClass}
                    >
                      View
                    </Link>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(r);
                      }}
                      className={ownerListActionClass}
                    >
                      Edit
                    </button>
                    {isSuperAdmin && r.is_active === false ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!token) return;
                          requestConfirm({
                            title: "Approve restaurant",
                            message: `Approve “${r.name}”? It will become visible to customers.`,
                            confirmLabel: "Approve",
                            variant: "info",
                            onConfirm: async () => {
                              try {
                                const updated = await apiPatch<R>(`/api/restaurants/${r.id}/`, { is_active: true }, token);
                                await syncRestaurantsListAfterUpsert(queryClient, updated);
                                void queryClient.invalidateQueries({ queryKey: ["public-restaurants"] });
                              } catch {
                                /* toast optional */
                              }
                            },
                          });
                        }}
                        className={ownerListActionClass}
                      >
                        Approve
                      </button>
                    ) : null}
                    {r.is_active !== false ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!token) return;
                          requestConfirm({
                            title: "Suspend restaurant",
                            message: `Suspend “${r.name}”? It will be hidden from customers.`,
                            confirmLabel: "Suspend",
                            variant: "warning",
                            onConfirm: async () => {
                              try {
                                const updated = await apiPatch<R>(`/api/restaurants/${r.id}/`, { is_active: false }, token);
                                await syncRestaurantsListAfterUpsert(queryClient, updated);
                                void queryClient.invalidateQueries({ queryKey: ["public-restaurants"] });
                              } catch {
                                /* toast optional */
                              }
                            },
                          });
                        }}
                        className={ownerListActionDangerClass}
                      >
                        Suspend
                      </button>
                    ) : null}
                    {isSuperAdmin ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!token) return;
                          requestConfirm({
                            title: "Delete restaurant",
                            message: `Delete “${r.name}”? This cannot be undone.`,
                            confirmLabel: "Delete",
                            variant: "danger",
                            onConfirm: async () => {
                              setDeletingId(r.id);
                              try {
                                await apiDelete(`/api/restaurants/${r.id}/`, token);
                                await queryClient.invalidateQueries({ queryKey: ["restaurants"] });
                              } finally {
                                setDeletingId(null);
                              }
                            },
                          });
                        }}
                        disabled={deletingId === r.id}
                        className={ownerListActionDangerClass}
                      >
                        {deletingId === r.id ? "Deleting…" : "Delete"}
                      </button>
                    ) : null}
                  </>
                }
              />
            );
        }}
      />

      {ConfirmDialog}

      {showForm && (
        <AppModal
          key={
            editRestaurant
              ? `edit-${editRestaurant.id}`
              : `add-restaurant-${platformDefaults?.id ?? "new"}-${platformDefaults?.updated_at ?? ""}`
          }
          panelClassName="max-w-lg p-6"
        >
            <h3 className="font-display font-semibold text-lg text-foreground mb-4">
              {editRestaurant ? "Edit Restaurant" : "Add Restaurant"}
            </h3>
            {editNeedsApproval ? (
              <div className="mb-4 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
                <p className="font-medium text-foreground">Pending super admin approval</p>
                <p className="text-text-muted mt-1 text-xs">
                  This restaurant is hidden from customers until it is approved. You can review changes below, then approve or
                  continue editing.
                </p>
              </div>
            ) : null}
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!token) return;
                setSubmitError(null);
                const form = e.currentTarget;
                const fd = new FormData(form);
                let ownerId = String(fd.get("user") ?? "").trim();
                if (editRestaurant && !ownerId) {
                  ownerId = String(editRestaurant.user);
                }
                const name = restaurantName.trim();
                const phoneTrim = restaurantPhone.trim();
                const slug = restaurantSlug.trim();
                const address = formAddress.trim();
                const perTxRaw = String(fd.get("per_transaction_fee") ?? "").trim();
                const perTx = perTxRaw === "" ? 0 : Number(perTxRaw);
                if (!Number.isFinite(perTx) || perTx < 0) {
                  setSubmitError("Per transaction fee must be a non-negative number (0 = use platform default).");
                  return;
                }
                const subFeeRaw = String(fd.get("subscription_fee_per_month") ?? "").trim();
                const smsRaw = String(fd.get("sms_per_usage") ?? "").trim();
                const dueThreshRaw = String(fd.get("due_threshold") ?? "").trim();
                const subStart = String(fd.get("subscription_start") ?? "").trim();
                const subEnd = String(fd.get("subscription_end") ?? "").trim();
                const dueBalRaw = fd.get("due_balance");
                const due_balance =
                  dueBalRaw === "" || dueBalRaw === null ? 0 : Number(dueBalRaw);
                const logoEl = form.elements.namedItem("logo") as HTMLInputElement | null;
                const logoFile = logoEl?.files?.[0];

                if (!editRestaurant && !ownerId) {
                  setSubmitError("Select an owner.");
                  return;
                }
                if (!name || !phoneTrim) {
                  setSubmitError("Name and phone are required.");
                  return;
                }
                const phoneParsed = parseLocalPhone(phoneTrim);
                if (!phoneParsed.ok) {
                  setSubmitError(phoneParsed.message);
                  return;
                }
                const phone = phoneParsed.digits;
                if (formLat.trim() !== "" && Number.isNaN(Number(formLat))) {
                  setSubmitError("Invalid latitude.");
                  return;
                }
                if (formLng.trim() !== "" && Number.isNaN(Number(formLng))) {
                  setSubmitError("Invalid longitude.");
                  return;
                }
                if (Number.isNaN(Number(formDeliveryRadiusKm)) || Number(formDeliveryRadiusKm) < 0.1) {
                  setSubmitError("Delivery radius must be at least 0.1 km.");
                  return;
                }

                const appendFormFields = (data: FormData) => {
                  data.append("user", ownerId);
                  data.append("name", name);
                  data.append("phone", phone);
                  data.append("slug", slug);
                  data.append("address", address);
                  data.append("due_balance", String(due_balance));
                  data.append("per_transaction_fee", String(perTx));
                  data.append("subscription_fee_per_month", subFeeRaw);
                  data.append("sms_per_usage", smsRaw);
                  data.append("due_threshold", dueThreshRaw);
                  data.append("subscription_start", subStart);
                  data.append("subscription_end", subEnd);
                  data.append("is_open", formIsOpen ? "true" : "false");
                  data.append("can_delivery", formCanDelivery ? "true" : "false");
                  data.append("delivery_radius_km", formDeliveryRadiusKm);
                  if (formLat.trim() !== "") data.append("latitude", formLat.trim());
                  if (formLng.trim() !== "") data.append("longitude", formLng.trim());
                  if (logoFile) data.append("logo", logoFile);
                };

                setSubmitBusy(true);
                try {
                  let saved: R;
                  const data = new FormData();
                  appendFormFields(data);
                  if (editRestaurant) {
                    saved = await apiPatchForm<R>(`/api/restaurants/${editRestaurant.id}/`, data, token);
                  } else {
                    saved = await apiPostForm<R>("/api/restaurants/", data, token);
                  }
                  await syncRestaurantsListAfterUpsert(queryClient, saved);
                  setShowForm(false);
                  setEditRestaurant(null);
                } catch (err) {
                  setSubmitError(err instanceof Error ? err.message : "Could not save restaurant.");
                } finally {
                  setSubmitBusy(false);
                }
              }}
            >
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block" htmlFor="rest-owner">
                  Owner *
                </label>
                <select
                  id="rest-owner"
                  name="user"
                  required={!editRestaurant}
                  defaultValue={editRestaurant?.user != null ? String(editRestaurant.user) : ""}
                  onChange={(ev) => {
                    const id = ev.target.value;
                    if (editRestaurant) return;
                    if (!id) return;
                    const ou = (users as { id: number; phone: string; role: string }[] | undefined)?.find(
                      (u) => String(u.id) === id && u.role === "owner",
                    );
                    if (ou?.phone) setRestaurantPhone(ou.phone);
                  }}
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                >
                  <option value="">Select owner</option>
                  {(users as { id: number; name: string; role: string }[] | undefined)
                    ?.filter((u) => u.role === "owner")
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block" htmlFor="rest-name">
                  Name *
                </label>
                <input
                  id="rest-name"
                  name="name"
                  type="text"
                  required
                  value={restaurantName}
                  onChange={(ev) => {
                    const v = ev.target.value;
                    setRestaurantName(v);
                    if (!editRestaurant && !slugTouched) {
                      setRestaurantSlug(slugifyName(v));
                    }
                  }}
                  placeholder="Restaurant name"
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block" htmlFor="rest-slug">
                  Slug
                </label>
                <input
                  id="rest-slug"
                  name="slug"
                  type="text"
                  value={restaurantSlug}
                  onChange={(ev) => {
                    setRestaurantSlug(ev.target.value);
                    if (!editRestaurant) setSlugTouched(true);
                  }}
                  placeholder="Leave blank to auto-generate"
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block" htmlFor="rest-phone">
                  Phone *
                </label>
                <input
                  id="rest-phone"
                  name="phone"
                  type="text"
                  required
                  value={restaurantPhone}
                  onChange={(ev) => setRestaurantPhone(ev.target.value)}
                  placeholder="+91 XXXXX XXXXX"
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block" htmlFor="rest-logo">
                  Logo
                </label>
                {editRestaurant?.logo ? (
                  <div className="flex items-center gap-3 mb-2">
                    <img
                      src={resolveMediaUrl(editRestaurant.logo) ?? ""}
                      alt=""
                      className="w-14 h-14 rounded-xl object-cover border border-border bg-surface"
                    />
                    <span className="text-xs text-text-muted">Current logo — choose a file below to replace</span>
                  </div>
                ) : null}
                <input
                  id="rest-logo"
                  name="logo"
                  type="file"
                  accept="image/*"
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm file:mr-3 file:border-0 file:bg-primary-50 file:text-primary file:text-xs file:font-semibold file:rounded-lg file:px-3 file:py-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block" htmlFor="rest-address">
                  Address
                </label>
                <input
                  id="rest-address"
                  name="address"
                  type="text"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="Filled automatically from map or coordinates"
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block">Location</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      value={formLat}
                      onChange={(ev) => setFormLat(ev.target.value)}
                      className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">Longitude</label>
                    <input
                      type="number"
                      step="any"
                      value={formLng}
                      onChange={(ev) => setFormLng(ev.target.value)}
                      className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <LocationMapPicker
                    latitude={formLat}
                    longitude={formLng}
                    onCoordinatesChange={(nextLat, nextLng) => {
                      setFormLat(nextLat);
                      setFormLng(nextLng);
                    }}
                    onPlaceSelected={setFormAddress}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block" htmlFor="rest-ptf">
                  Per transaction fee (₹)
                </label>
                <input
                  id="rest-ptf"
                  name="per_transaction_fee"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={
                    editRestaurant?.per_transaction_fee != null
                      ? String(editRestaurant.per_transaction_fee)
                      : platformDefaults
                        ? String(toNum(platformDefaults.per_transaction_fee))
                        : "0"
                  }
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
                <p className="mt-1 text-xs text-text-muted">0 = charge the platform default from Settings for each order.</p>
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block" htmlFor="rest-sub-fee">
                  Subscription fee / month (₹) — optional override
                </label>
                <input
                  id="rest-sub-fee"
                  name="subscription_fee_per_month"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={
                    editRestaurant?.subscription_fee_per_month != null &&
                    String(editRestaurant.subscription_fee_per_month).trim() !== ""
                      ? String(editRestaurant.subscription_fee_per_month)
                      : !editRestaurant && platformDefaults
                        ? String(toNum(platformDefaults.subscription_fee_per_month))
                        : ""
                  }
                  placeholder="Leave blank for platform default"
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block" htmlFor="rest-sms">
                  SMS usage cost (₹) — optional override
                </label>
                <input
                  id="rest-sms"
                  name="sms_per_usage"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={
                    editRestaurant?.sms_per_usage != null && String(editRestaurant.sms_per_usage).trim() !== ""
                      ? String(editRestaurant.sms_per_usage)
                      : !editRestaurant && platformDefaults
                        ? String(toNum(platformDefaults.sms_per_usage))
                        : ""
                  }
                  placeholder="Leave blank for platform default"
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
                <p className="mt-1 text-xs text-text-muted">
                  Applies to staff OTP and order-status SMS for this venue. Owner OTP still uses the global rate from Settings.
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block" htmlFor="rest-due-thresh">
                  Due threshold (₹) — optional override
                </label>
                <input
                  id="rest-due-thresh"
                  name="due_threshold"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={
                    editRestaurant?.due_threshold != null && String(editRestaurant.due_threshold).trim() !== ""
                      ? String(editRestaurant.due_threshold)
                      : !editRestaurant && platformDefaults
                        ? String(toNum(platformDefaults.due_threshold))
                        : ""
                  }
                  placeholder="Leave blank for platform default"
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
                <p className="mt-1 text-xs text-text-muted">
                  When this venue&apos;s due balance reaches this amount (and the value is greater than zero), it can be
                  auto-suspended. Blank uses the value from Super Admin Settings.
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block" htmlFor="rest-due">
                  Due Balance
                </label>
                <input
                  id="rest-due"
                  name="due_balance"
                  type="number"
                  step="0.01"
                  defaultValue={editRestaurant?.due_balance != null ? String(editRestaurant.due_balance) : "0"}
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-text-secondary mb-1.5 block" htmlFor="rest-sub-s">
                    Subscription Start
                  </label>
                  <input
                    id="rest-sub-s"
                    name="subscription_start"
                    type="date"
                    defaultValue={toDateInputValue(editRestaurant?.subscription_start)}
                    className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-text-secondary mb-1.5 block" htmlFor="rest-sub-e">
                    Subscription End
                  </label>
                  <input
                    id="rest-sub-e"
                    name="subscription_end"
                    type="date"
                    defaultValue={toDateInputValue(editRestaurant?.subscription_end)}
                    className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="rest-open"
                  type="checkbox"
                  checked={formIsOpen}
                  onChange={(ev) => setFormIsOpen(ev.target.checked)}
                  className="rounded border-border"
                />
                <label htmlFor="rest-open" className="text-sm font-medium text-text-secondary">
                  Is open
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="rest-delivery"
                  type="checkbox"
                  checked={formCanDelivery}
                  onChange={(ev) => setFormCanDelivery(ev.target.checked)}
                  className="rounded border-border"
                />
                <label htmlFor="rest-delivery" className="text-sm font-medium text-text-secondary">
                  Can delivery
                </label>
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block" htmlFor="rest-delivery-radius">
                  Delivery radius (km)
                </label>
                <input
                  id="rest-delivery-radius"
                  type="number"
                  min={0.1}
                  step="0.1"
                  value={formDeliveryRadiusKm}
                  onChange={(ev) => setFormDeliveryRadiusKm(ev.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
              {submitError ? <p className="text-sm text-error">{submitError}</p> : null}
              <div className="flex flex-wrap gap-3 mt-6">
                {editNeedsApproval ? (
                  <button
                    type="button"
                    disabled={approveBusy || submitBusy}
                    onClick={() => {
                      if (!token || !editRestaurant) return;
                      const restaurant = editRestaurant;
                      requestConfirm({
                        title: "Approve restaurant",
                        message: `Approve “${restaurant.name}”? It will become visible to customers.`,
                        confirmLabel: "Approve",
                        variant: "info",
                        onConfirm: async () => {
                          setApproveBusy(true);
                          setSubmitError(null);
                          try {
                            const updated = await apiPatch<R>(
                              `/api/restaurants/${restaurant.id}/`,
                              { is_active: true },
                              token,
                            );
                            await syncRestaurantsListAfterUpsert(queryClient, updated);
                            void queryClient.invalidateQueries({ queryKey: ["public-restaurants"] });
                            setShowForm(false);
                            setEditRestaurant(null);
                          } catch (err) {
                            setSubmitError(err instanceof Error ? err.message : "Could not approve restaurant.");
                          } finally {
                            setApproveBusy(false);
                          }
                        },
                      });
                    }}
                    className="h-11 min-w-[7.5rem] px-4 rounded-xl bg-success/15 text-success text-sm font-semibold hover:bg-success/25 disabled:opacity-60 border border-success/30"
                  >
                    {approveBusy ? "Approving…" : "Approve"}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={submitBusy || approveBusy}
                  onClick={() => {
                    setShowForm(false);
                    setEditRestaurant(null);
                  }}
                  className="flex-1 min-w-[6rem] h-11 rounded-xl border border-border text-sm font-semibold text-text-secondary hover:bg-surface disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitBusy || approveBusy}
                  className="flex-1 min-w-[6rem] h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-600 disabled:opacity-60"
                >
                  {submitBusy ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
        </AppModal>
      )}
    </>
  );
}
