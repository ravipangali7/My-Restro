import { createFileRoute } from "@tanstack/react-router";
import { MenuMediaThumb } from "@/components/shared/MenuMediaThumb";
import { OrderTableVisual } from "@/components/shared/OrderTableVisual";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { intervalToDuration } from "date-fns";
import { Phone, Timer, UserRound, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { orderStatusConfirmMessage, useConfirmAction } from "@/hooks/use-confirm-action";
import { useOrders, useTransitionOrderStatus } from "@/hooks/use-rest-api";
import { useAuth } from "@/lib/auth-context";
import { useRestaurantScope } from "@/lib/restaurant-context";

export const Route = createFileRoute("/staff/waiting-pickup")({ component: WaitingPickupOrders });

const POLL_MS = 5000;

/** Mirrors `OrderSerializer` / nested `OrderItemSerializer` (same payload shape as live orders). */
interface LiveOrderItemRow {
  id: number;
  product: number | null;
  product_item: number | null;
  comboset: number | null;
  price: string | number;
  quantity: string | number;
  total: string | number;
  line_label?: string | null;
  line_image?: string | null;
}

interface OrderRow {
  id: number;
  order_id: string;
  status: string;
  people_for: number;
  table: number | null;
  table_name?: string | null;
  table_image?: string | null;
  order_type?: string;
  customer: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  guest_customer_name?: string;
  guest_customer_phone?: string;
  sub_total?: string | number;
  discount?: string | number;
  delivery_fee?: string | number;
  total?: string | number;
  created_at?: string | null;
  updated_at?: string | null;
  waiting_pickup_at?: string | null;
  items: LiveOrderItemRow[];
}

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "string" ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "₹0.00";
  const n = typeof v === "string" ? Number.parseFloat(v) : v;
  if (Number.isNaN(n)) return "—";
  return `₹${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatQuantity(q: string | number): string {
  const n = typeof q === "string" ? Number.parseFloat(q) : q;
  if (!Number.isFinite(n)) return String(q);
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatOrderTypeLabel(raw: string | null | undefined): string {
  if (raw == null || raw === "") return "—";
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function customerContact(order: OrderRow): { name: string; phone?: string } | null {
  const guestName = (order.guest_customer_name ?? "").trim();
  const guestPhone = (order.guest_customer_phone ?? "").trim();
  if (order.customer != null && (order.customer_name || order.customer_phone)) {
    const name = (order.customer_name ?? "").trim() || "Registered customer";
    const phone = (order.customer_phone ?? "").trim();
    return phone ? { name, phone } : { name };
  }
  if (guestName || guestPhone) {
    const name = guestName || "Guest";
    return guestPhone ? { name, phone: guestPhone } : { name };
  }
  return null;
}

/** Start of pickup-queue wait: explicit timestamp, else best-effort fallbacks for legacy rows. */
function waitingSinceMs(order: OrderRow): number | null {
  const raw = order.waiting_pickup_at ?? order.updated_at ?? order.created_at;
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

function sortOldestFirst(a: OrderRow, b: OrderRow): number {
  const fa = waitingSinceMs(a) ?? Number.MAX_SAFE_INTEGER;
  const fb = waitingSinceMs(b) ?? Number.MAX_SAFE_INTEGER;
  const byWait = fa - fb;
  if (byWait !== 0) return byWait;
  return a.id - b.id;
}

function formatWaitLabel(since: Date, now: Date): string {
  const d = intervalToDuration({ start: since, end: now });
  const h = d.hours ?? 0;
  const m = d.minutes ?? 0;
  const s = d.seconds ?? 0;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function LiveWaitingBadge({ sinceIso }: { sinceIso: string | null | undefined }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const sinceMs = sinceIso ? Date.parse(sinceIso) : NaN;
  if (!sinceIso || !Number.isFinite(sinceMs)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-surface-alt px-2 py-0.5 text-[11px] font-semibold text-text-muted ring-1 ring-border">
        <Timer size={12} aria-hidden />
        —
      </span>
    );
  }

  const since = new Date(sinceMs);
  const label = formatWaitLabel(since, new Date(now));
  const longWait = now - sinceMs >= 15 * 60 * 1000;

  return (
    <time
      dateTime={sinceIso}
      title={`Waiting since ${since.toLocaleString()}`}
      className={
        longWait
          ? "inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-900 ring-1 ring-amber-200/90"
          : "inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-900 ring-1 ring-teal-200/80"
      }
    >
      <Timer size={12} aria-hidden />
      {label}
    </time>
  );
}

function WaitingPickupCard({
  order,
  showDelivered,
  deliverEnabled,
  busy,
  onDelivered,
}: {
  order: OrderRow;
  showDelivered: boolean;
  deliverEnabled: boolean;
  busy: boolean;
  onDelivered: () => void;
}) {
  const items = order.items ?? [];
  const waitAnchor = order.waiting_pickup_at ?? order.updated_at ?? order.created_at ?? null;

  const borderClass =
    order.status === "pending"
      ? "border-warning"
      : order.status === "accepted"
        ? "border-info"
        : order.status === "running"
          ? "border-primary"
          : "border-success";

  const tableLabel = order.table_name?.trim() || (order.table != null ? `Table #${order.table}` : null);
  const isDelivery = (order.order_type ?? "").toLowerCase() === "delivery";
  const showTableRow = Boolean(tableLabel) && !isDelivery;
  const contact = customerContact(order);
  const subTotal = num(order.sub_total);
  const discount = num(order.discount);
  const deliveryFee = num(order.delivery_fee);
  const grandTotal = num(order.total);

  return (
    <div
      className={`bg-card rounded-xl border-2 p-3 shadow-sm hover:shadow-md transition-shadow ${borderClass}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <span className="font-mono font-bold text-sm block truncate">{order.order_id}</span>
          <StatusBadge status={order.status} className="mt-1.5" />
        </div>
        <LiveWaitingBadge sinceIso={waitAnchor} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 text-xs text-text-secondary">
        <span className="rounded-md bg-surface-alt/80 px-1.5 py-0.5 font-semibold text-text-secondary ring-1 ring-border/60">
          {formatOrderTypeLabel(order.order_type)}
        </span>
        {showTableRow && tableLabel != null && (
          <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground" title="Table">
            <OrderTableVisual
              tableName={order.table_name}
              tableId={order.table}
              tableImage={order.table_image}
              compact
            />
          </span>
        )}
        <span className="flex items-center gap-1">
          <Users size={12} /> {order.people_for}
        </span>
      </div>
      {contact && (
        <div className="mb-2 rounded-lg border border-border/70 bg-surface-alt/40 px-2.5 py-2 text-xs">
          <div className="flex items-start gap-2">
            <UserRound size={14} className="mt-0.5 shrink-0 text-text-muted" aria-hidden />
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="font-semibold text-foreground leading-tight break-words">{contact.name}</p>
              {contact.phone ? (
                <p className="flex items-center gap-1.5 text-text-secondary tabular-nums">
                  <Phone size={12} className="shrink-0" aria-hidden />
                  <span>{contact.phone}</span>
                </p>
              ) : null}
            </div>
          </div>
        </div>
      )}
      <div className="bg-surface rounded-lg p-2.5 space-y-2">
        {items.map((item) => {
          const label = (item.line_label ?? "").trim() || `Item #${item.id}`;
          const qty = formatQuantity(item.quantity);
          return (
            <div key={item.id} className="flex gap-2.5 items-start">
              <MenuMediaThumb
                mediaPath={item.line_image ?? null}
                alt={label}
                className="h-11 w-11 shrink-0 rounded-lg border border-border"
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-sm font-medium text-foreground leading-snug break-words">{label}</p>
                <p className="text-[11px] text-text-secondary tabular-nums">
                  {formatMoney(item.price)} × {qty}
                  <span className="text-text-muted"> → </span>
                  <span className="font-semibold text-foreground">{formatMoney(item.total)}</span>
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <dl className="mt-2.5 space-y-1 rounded-lg border border-border/80 bg-surface-alt/30 px-2.5 py-2 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-text-muted">Items subtotal</dt>
          <dd className="font-medium tabular-nums text-foreground">{formatMoney(subTotal)}</dd>
        </div>
        {discount > 0 ? (
          <div className="flex justify-between gap-2">
            <dt className="text-text-muted">Offer / order discount</dt>
            <dd className="font-medium tabular-nums text-success">−{formatMoney(discount)}</dd>
          </div>
        ) : null}
        {deliveryFee > 0 ? (
          <div className="flex justify-between gap-2">
            <dt className="text-text-muted">Delivery</dt>
            <dd className="font-medium tabular-nums text-foreground">{formatMoney(deliveryFee)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-2 border-t border-border pt-1.5 mt-1">
          <dt className="font-semibold text-foreground">Total</dt>
          <dd className="font-bold tabular-nums text-primary">{formatMoney(grandTotal)}</dd>
        </div>
      </dl>
      {showDelivered ? (
        <button
          type="button"
          disabled={busy || !deliverEnabled}
          title={
            deliverEnabled
              ? undefined
              : "Mark the order that has been waiting the longest as delivered first."
          }
          onClick={onDelivered}
          className="mt-2.5 w-full h-9 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 disabled:opacity-50"
        >
          {busy ? "…" : "Delivered"}
        </button>
      ) : null}
    </div>
  );
}

function WaitingPickupOrders() {
  const { restaurantId } = useRestaurantScope();
  const { role } = useAuth();
  const { data, isLoading, error, isFetching } = useOrders(restaurantId, {
    refetchInterval: POLL_MS,
    forWaiterPickupQueue: role === "waiter",
  });
  const transitionOrder = useTransitionOrderStatus();
  const { requestConfirm, ConfirmDialog } = useConfirmAction();

  const orders = useMemo(() => {
    const rows = (data ?? []) as OrderRow[];
    return rows.filter((o) => o.status === "waiting_pickup").sort(sortOldestFirst);
  }, [data]);

  const nextDeliverableId = orders[0]?.id ?? null;

  const errMsg = error instanceof Error ? error.message : error ? String(error) : null;

  if (restaurantId == null) {
    return <p className="text-sm text-text-muted">No restaurant assigned.</p>;
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="font-display font-semibold text-lg text-foreground">Waiting Pickup Orders</h2>
        {isFetching && !isLoading ? (
          <span className="text-xs font-medium text-text-muted">Refreshing…</span>
        ) : null}
      </div>
      {errMsg && <p className="text-sm text-error mb-2">{errMsg}</p>}
      {isLoading && <p className="text-sm text-text-muted mb-4">Loading…</p>}
      {!isLoading && orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center">
          <p className="text-sm font-medium text-text-muted">No orders waiting for pickup.</p>
        </div>
      ) : null}
      {!isLoading && orders.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => {
            const busy = transitionOrder.isPending && transitionOrder.variables?.orderId === order.id;
            return (
              <WaitingPickupCard
                key={order.id}
                order={order}
                showDelivered={role === "waiter"}
                deliverEnabled={order.id === nextDeliverableId}
                busy={busy}
                onDelivered={() =>
                  requestConfirm({
                    title: "Mark delivered",
                    message: orderStatusConfirmMessage(order.order_id, "delivered"),
                    confirmLabel: "Delivered",
                    variant: "warning",
                    onConfirm: () => {
                      transitionOrder.mutate({ orderId: order.id, status: "delivered" });
                    },
                  })
                }
              />
            );
          })}
        </div>
      ) : null}
      {ConfirmDialog}
    </>
  );
}
