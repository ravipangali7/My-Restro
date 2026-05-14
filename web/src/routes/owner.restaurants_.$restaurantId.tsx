import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ViewField, ViewSection } from "@/components/shared/ViewField";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePayRestaurantDue, usePlatformDefaults, useRestaurants } from "@/hooks/use-rest-api";
import { resolveMediaUrl } from "@/lib/api";
import type { PlatformDefaultsDTO } from "@/lib/super-settings-cache";
import { money } from "@/lib/money";
import { ArrowLeft, QrCode, Store } from "lucide-react";

export const Route = createFileRoute("/owner/restaurants_/$restaurantId")({
  component: OwnerRestaurantDetailPage,
});

type RestaurantDetail = {
  id: number;
  /** Owner account (User PK) on the Restaurant model. */
  user?: number;
  name: string;
  slug?: string;
  phone: string;
  address: string;
  logo?: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  reference_latitude: string | number | null;
  reference_longitude: string | number | null;
  /** Haversine distance in metres between main and reference coordinates; null if either pair is missing. */
  reference_distance_m?: number | null;
  proximity_alert_radius_m: string | number;
  due_balance: string | number;
  /** Sum of platform-billed SMS rows (OTP + order status texts, etc.). */
  due_sms_usage?: string | number;
  /** Sum of per-order platform transaction fees owed. */
  due_service_charge?: string | number;
  is_active?: boolean;
  is_open?: boolean;
  can_delivery?: boolean;
  delivery_fee_per_km?: string | number;
  delivery_radius_km?: string | number;
  per_transaction_fee?: string | number;
  due_threshold?: string | number | null;
  effective_due_threshold?: string | number;
  subscription_start?: string | null;
  subscription_end?: string | null;
  created_at?: string;
  updated_at?: string;
};

function formatIsoDate(value: string | null | undefined): string {
  if (value == null || value === "") return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
}

function formatIsoDateTime(value: string | null | undefined): string {
  if (value == null || value === "") return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

/** Normalize due balance for API `amount` (must match server Decimal string). */
function dueBalanceApiString(value: string | number): string {
  if (typeof value === "string") return value.trim();
  if (!Number.isFinite(value)) return "0.00";
  return value.toFixed(2);
}

function OwnerRestaurantDetailPage() {
  const { restaurantId } = Route.useParams();
  const { data: restaurants = [], isLoading, error } = useRestaurants();
  const { data: platformDefaults } = usePlatformDefaults();
  const payDue = usePayRestaurantDue();
  const [payError, setPayError] = useState<string | null>(null);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payStep, setPayStep] = useState<"form" | "qr">("form");
  const [dueRemarks, setDueRemarks] = useState("");

  const restaurant = useMemo(() => {
    const list = restaurants as RestaurantDetail[];
    return list.find((r) => String(r.id) === restaurantId);
  }, [restaurants, restaurantId]);

  const pd = platformDefaults as PlatformDefaultsDTO | undefined;
  const threshold = Number(
    restaurant != null
      ? (restaurant.effective_due_threshold ?? restaurant.due_threshold ?? pd?.due_threshold ?? NaN)
      : NaN,
  );
  const dueNum = restaurant != null ? Number(restaurant.due_balance ?? 0) : NaN;
  const thresholdActive = Number.isFinite(threshold) && threshold > 0;
  const dueExceedsThreshold = thresholdActive && Number.isFinite(dueNum) && dueNum >= threshold;
  const canPay = restaurant != null && Number.isFinite(dueNum) && dueNum > 0;

  if (error) {
    return <p className="text-sm text-error">Failed to load restaurants.</p>;
  }
  if (isLoading) {
    return <p className="text-sm text-text-muted">Loading…</p>;
  }
  if (!restaurant) {
    return <p className="text-sm text-text-muted">Restaurant not found.</p>;
  }

  const r = restaurant;
  const logoSrc = resolveMediaUrl(r.logo ?? null);
  const dueApiAmount = dueBalanceApiString(r.due_balance);
  const platformQrSrc = resolveMediaUrl(pd?.due_payment_qr ?? null);

  const openPayDialog = () => {
    setPayError(null);
    setDueRemarks("");
    setPayStep("form");
    setPayDialogOpen(true);
  };

  const closePayDialog = () => {
    setPayDialogOpen(false);
    setPayStep("form");
    setDueRemarks("");
    setPayError(null);
  };

  return (
    <>
      <Link
        to="/owner/restaurants"
        className="flex items-center gap-1 text-sm text-text-secondary hover:text-foreground mb-4"
      >
        <ArrowLeft size={16} /> Back to Restaurants
      </Link>

      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center overflow-hidden border border-border">
          {logoSrc ? (
            <img src={logoSrc} alt="" className="w-full h-full object-cover" />
          ) : (
            <Store size={24} className="text-primary" />
          )}
        </div>
        <div>
          <h2 className="font-display font-bold text-xl text-foreground">{r.name}</h2>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <StatusBadge status={r.is_active === false ? "pending" : "active"} />
            {r.slug ? <span className="text-sm text-text-muted">{r.slug}</span> : null}
          </div>
        </div>
      </div>

      {dueExceedsThreshold && r.is_active === false ? (
        <div
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100 mb-6"
          role="status"
        >
          <p className="font-semibold">Suspended for outstanding dues</p>
          <p className="mt-1 text-amber-900/90 dark:text-amber-100/90">
            This location is inactive because the due balance has reached the platform threshold. Pay the due amount to
            restore access.
          </p>
        </div>
      ) : null}

      <ViewSection title="Due to platform">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">SMS usage</p>
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {money(r.due_sms_usage ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Service charge</p>
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {money(r.due_service_charge ?? 0)}
                </p>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Total due</p>
              <p className="text-2xl font-bold text-foreground tabular-nums">{money(r.due_balance)}</p>
            </div>
            {thresholdActive ? (
              <p className="text-sm text-text-secondary">
                Effective due threshold (for this venue): {money(threshold)}
                {dueExceedsThreshold ? (
                  <span className="text-amber-800 dark:text-amber-200"> (threshold reached — location may be inactive)</span>
                ) : null}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            disabled={!canPay || payDue.isPending}
            onClick={openPayDialog}
            className="h-11 px-5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50 disabled:pointer-events-none hover:bg-primary/90"
          >
            Pay due
          </button>
        </div>
        {payError ? <p className="text-sm text-error mt-3">{payError}</p> : null}
      </ViewSection>

      <Dialog open={payDialogOpen} onOpenChange={(o) => (o ? setPayDialogOpen(true) : closePayDialog())}>
        <DialogContent className="max-w-md border-border bg-card text-foreground sm:rounded-xl">
          {payStep === "form" ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-display">Pay platform due</DialogTitle>
                <DialogDescription className="text-text-secondary">
                  Confirm the amount and add any payment reference notes. You will then see the platform QR to pay
                  before this due is marked settled.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-1">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-text-muted">Amount due</label>
                  <input
                    type="text"
                    readOnly
                    tabIndex={-1}
                    value={money(r.due_balance)}
                    className="mt-1.5 w-full h-11 px-4 rounded-xl border border-border bg-surface-alt text-base font-semibold tabular-nums text-foreground outline-none cursor-default"
                    aria-label="Amount due (cannot be reduced)"
                  />
                  <p className="mt-1 text-xs text-text-muted">This amount is fixed to your current balance.</p>
                </div>
                <div>
                  <label htmlFor="due-remarks" className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Remarks
                  </label>
                  <textarea
                    id="due-remarks"
                    value={dueRemarks}
                    onChange={(e) => setDueRemarks(e.target.value.slice(0, 200))}
                    rows={3}
                    placeholder="e.g. UPI reference, transaction ID, bank note…"
                    className="mt-1.5 w-full px-4 py-3 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-text-muted outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-y min-h-[88px]"
                  />
                  <p className="mt-1 text-xs text-text-muted">{dueRemarks.length}/200</p>
                </div>
                {payError ? <p className="text-sm text-error">{payError}</p> : null}
              </div>
              <DialogFooter className="gap-2 sm:gap-2">
                <button
                  type="button"
                  onClick={closePayDialog}
                  className="h-11 px-4 rounded-xl border border-border text-sm font-semibold text-text-secondary hover:bg-surface transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPayError(null);
                    if (!platformQrSrc) {
                      setPayError(
                        "The platform payment QR is not set yet. Please contact the super admin to configure it in platform settings.",
                      );
                      return;
                    }
                    setPayStep("qr");
                  }}
                  className="h-11 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"
                >
                  Continue to payment
                </button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="font-display">Scan to pay</DialogTitle>
                <DialogDescription className="text-text-secondary">
                  Pay using the method shown in this QR. When your transfer is done, confirm below to record the
                  settlement and clear this venue&apos;s due.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-4 py-2">
                {platformQrSrc ? (
                  <div className="rounded-xl border border-border bg-white p-3 shadow-sm">
                    <img src={platformQrSrc} alt="Platform payment QR code" className="max-h-56 w-56 object-contain" />
                  </div>
                ) : null}
                <p className="text-sm text-text-secondary text-center">
                  Amount: <span className="font-semibold tabular-nums text-foreground">{money(r.due_balance)}</span>
                </p>
                {payError ? <p className="text-sm text-error text-center">{payError}</p> : null}
              </div>
              <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <button
                  type="button"
                  disabled={payDue.isPending}
                  onClick={() => {
                    setPayError(null);
                    setPayStep("form");
                  }}
                  className="h-11 px-4 rounded-xl border border-border text-sm font-semibold text-text-secondary hover:bg-surface transition-colors disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={payDue.isPending}
                  onClick={() => {
                    setPayError(null);
                    payDue.mutate(
                      { restaurantId: r.id, remarks: dueRemarks, amount: dueApiAmount },
                      {
                        onSuccess: () => closePayDialog(),
                        onError: (e) =>
                          setPayError(e instanceof Error ? e.message : "Payment could not be completed."),
                      },
                    );
                  }}
                  className="h-11 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {payDue.isPending ? "Recording…" : "Complete payment"}
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ViewSection title="Restaurant details">
        <div className="mb-4">
          <Link
            to="/owner/menu-qr"
            search={{ restaurantId: r.id }}
            className="group relative flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/35 hover:shadow-sm"
          >
            <span className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
              <QrCode size={18} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">Menu QR</span>
              <span className="mt-0.5 block text-xs text-text-secondary">
                Open and share this restaurant&apos;s scan-to-order menu QR.
              </span>
            </span>
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <ViewField label="Restaurant ID" value={r.id} />
          <ViewField label="Owner user ID" value={r.user ?? "—"} />
          <ViewField label="Slug" value={r.slug || "—"} />
          <ViewField label="Name" value={r.name || "—"} />
          <ViewField label="Logo" value={r.logo ? String(r.logo) : "—"} />
          <ViewField label="Active" value={r.is_active === false ? "No" : "Yes"} />
          <ViewField label="Created" value={formatIsoDateTime(r.created_at)} />
          <ViewField label="Last updated" value={formatIsoDateTime(r.updated_at)} />
          <ViewField label="Phone" value={r.phone || "—"} />
          <ViewField label="Address" value={r.address || "—"} />
          <ViewField label="Open for orders" value={r.is_open ? "Yes" : "No"} />
          <ViewField label="Delivery enabled" value={r.can_delivery ? "Yes" : "No"} />
          <ViewField
            label="Delivery fee per km"
            value={r.delivery_fee_per_km != null ? money(r.delivery_fee_per_km) : "—"}
          />
          <ViewField
            label="Delivery radius"
            value={r.delivery_radius_km != null ? `${Number(r.delivery_radius_km).toLocaleString()} km` : "—"}
          />
          <ViewField
            label="Per-transaction fee"
            value={r.per_transaction_fee != null ? money(r.per_transaction_fee) : "—"}
          />
          <ViewField label="Due balance" value={money(r.due_balance)} />
          <ViewField label="Subscription start" value={formatIsoDate(r.subscription_start)} />
          <ViewField label="Subscription end" value={formatIsoDate(r.subscription_end)} />
          <ViewField
            label="Main coordinates (latitude, longitude)"
            value={
              r.latitude != null && r.longitude != null
                ? `${Number(r.latitude).toFixed(5)}, ${Number(r.longitude).toFixed(5)}`
                : "—"
            }
          />
          <ViewField
            label="Reference coordinates (latitude, longitude)"
            value={
              r.reference_latitude != null && r.reference_longitude != null
                ? `${Number(r.reference_latitude).toFixed(5)}, ${Number(r.reference_longitude).toFixed(5)}`
                : "—"
            }
          />
          <ViewField
            label="Distance main → reference"
            value={
              r.reference_distance_m != null && Number.isFinite(Number(r.reference_distance_m))
                ? `${Number(r.reference_distance_m).toLocaleString()} m`
                : "—"
            }
          />
          <ViewField label="Proximity alert radius" value={`${Number(r.proximity_alert_radius_m)} m`} />
        </div>
      </ViewSection>
    </>
  );
}
