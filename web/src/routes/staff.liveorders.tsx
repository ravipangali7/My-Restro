import { createFileRoute } from "@tanstack/react-router";
import { MenuMediaThumb } from "@/components/shared/MenuMediaThumb";
import { OrderTableVisual } from "@/components/shared/OrderTableVisual";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CheckCircle2, Phone, UserRound, Users, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useOrders, useTransitionOrderStatus } from "@/hooks/use-rest-api";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/staff/liveorders")({ component: LiveOrders });

/** Mirrors `OrderSerializer` / nested `OrderItemSerializer` for live kitchen cards. */
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

const LIVE_POLL_MS = 5000;

const KANBAN_STATUSES = ["pending", "accepted", "running", "ready"] as const;
type KanbanStatus = (typeof KANBAN_STATUSES)[number];

const COLUMN_META: Record<KanbanStatus, { title: string; accent: string }> = {
  pending: { title: "Pending", accent: "border-l-warning" },
  accepted: { title: "Accepted", accent: "border-l-info" },
  running: { title: "Running", accent: "border-l-primary" },
  ready: { title: "Ready", accent: "border-l-success" },
};

function parsePlacedMs(createdAt: string | null | undefined): number | null {
  if (!createdAt) return null;
  const t = Date.parse(createdAt);
  return Number.isFinite(t) ? t : null;
}

function orderAgeMinutes(placedMs: number, nowMs: number): number {
  return Math.max(0, (nowMs - placedMs) / 60_000);
}

/** Kitchen-oriented urgency: fresh (green) → aging (amber) → stale (orange) → very old (red). */
function ageBadgeStyles(minutes: number): string {
  if (minutes < 5) return "bg-success-bg text-success ring-1 ring-success/25";
  if (minutes < 15) return "bg-warning-bg text-warning ring-1 ring-warning/20";
  if (minutes < 30) return "bg-orange-50 text-orange-800 ring-1 ring-orange-200/80";
  return "bg-error-bg text-error ring-1 ring-error/25";
}

function formatPlacedClock(createdAt: string | null | undefined): string {
  if (!createdAt) return "—";
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatAgeShort(minutes: number): string {
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${Math.floor(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function OrderPlacedBadge({ createdAt }: { createdAt: string | null | undefined }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const placedMs = parsePlacedMs(createdAt ?? null);
  if (placedMs == null) {
    return (
      <span
        title="Placed time unavailable"
        className="shrink-0 inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums bg-muted text-muted-foreground"
      >
        —
      </span>
    );
  }

  const mins = orderAgeMinutes(placedMs, now);
  return (
    <span
      title={`Placed at ${formatPlacedClock(createdAt)} · ${formatAgeShort(mins)} ago`}
      className={`shrink-0 inline-flex flex-col items-end rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums leading-tight ${ageBadgeStyles(mins)}`}
    >
      <span>{formatPlacedClock(createdAt)}</span>
      <span className="text-[10px] font-medium opacity-90">{formatAgeShort(mins)} ago</span>
    </span>
  );
}

function sortOldestFirst(a: OrderRow, b: OrderRow): number {
  const ta = parsePlacedMs(a.created_at) ?? Number.MAX_SAFE_INTEGER;
  const tb = parsePlacedMs(b.created_at) ?? Number.MAX_SAFE_INTEGER;
  return ta - tb;
}

interface LiveOrderCardProps {
  order: OrderRow;
  busy: boolean;
  onTransition: (status: string, options?: { rejectReason?: string; onCommitted?: () => void }) => void;
}

function LiveOrderCard({ order, busy, onTransition }: LiveOrderCardProps) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const items = order.items ?? [];
  const borderClass =
    order.status === "pending"
      ? "border-warning"
      : order.status === "accepted"
        ? "border-info"
        : order.status === "running"
          ? "border-primary"
          : "border-success";

  const tableLabel =
    order.table_name?.trim() ||
    (order.table != null ? `Table #${order.table}` : null);
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
        <OrderPlacedBadge createdAt={order.created_at} />
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
      <div className="mt-2.5 space-y-2">
        {order.status === "pending" && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              type="button"
              disabled={busy}
              onClick={() => onTransition("accepted")}
              className="h-11 gap-2 rounded-xl bg-info text-primary-foreground text-sm font-semibold shadow-sm hover:bg-info/90"
            >
              <CheckCircle2 className="size-4 shrink-0" aria-hidden />
              {busy ? "Saving…" : "Accept order"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setRejectReason("");
                setRejectOpen(true);
              }}
              className="h-11 gap-2 rounded-xl border-2 border-destructive/70 text-destructive text-sm font-semibold hover:bg-destructive/10"
            >
              <XCircle className="size-4 shrink-0" aria-hidden />
              Reject
            </Button>
          </div>
        )}
        {order.status === "accepted" && (
          <Button
            type="button"
            disabled={busy}
            onClick={() => onTransition("running")}
            className="h-10 w-full rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
          >
            {busy ? "…" : "Start cooking"}
          </Button>
        )}
        {order.status === "running" && (
          <Button
            type="button"
            disabled={busy}
            onClick={() => onTransition("ready")}
            className="h-10 w-full rounded-lg bg-success text-primary-foreground text-xs font-semibold disabled:opacity-50"
          >
            {busy ? "…" : "Mark ready"}
          </Button>
        )}
        {order.status === "ready" && (
          <Button
            type="button"
            disabled={busy}
            onClick={() => onTransition("waiting_pickup")}
            className="h-10 w-full rounded-lg bg-success text-primary-foreground text-xs font-semibold disabled:opacity-50"
          >
            {busy ? "…" : "Complete"}
          </Button>
        )}
      </div>
      <Dialog
        open={rejectOpen}
        onOpenChange={(open) => {
          setRejectOpen(open);
          if (!open) setRejectReason("");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Reject this order?</DialogTitle>
            <DialogDescription>
              Order <span className="font-mono font-semibold text-foreground">{order.order_id}</span> will be
              marked rejected. The customer can see the reason you provide.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor={`reject-reason-${order.id}`} className="text-sm font-medium text-foreground">
              Reason <span className="text-destructive">*</span>
            </label>
            <textarea
              id={`reject-reason-${order.id}`}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="e.g. Item unavailable, kitchen closed for the day…"
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || !rejectReason.trim()}
              onClick={() => {
                const r = rejectReason.trim();
                if (!r) return;
                onTransition("rejected", {
                  rejectReason: r,
                  onCommitted: () => {
                    setRejectOpen(false);
                    setRejectReason("");
                  },
                });
              }}
            >
              {busy ? "Rejecting…" : "Confirm reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LiveOrders() {
  const { restaurantId } = useRestaurantScope();
  const { data, isLoading, error, isFetching } = useOrders(restaurantId, { refetchInterval: LIVE_POLL_MS });
  const transitionOrder = useTransitionOrderStatus();

  const columns = useMemo(() => {
    const rows = (data ?? []) as OrderRow[];
    const active = rows.filter((o) => (KANBAN_STATUSES as readonly string[]).includes(o.status));
    const buckets: Record<KanbanStatus, OrderRow[]> = {
      pending: [],
      accepted: [],
      running: [],
      ready: [],
    };
    for (const o of active) {
      const s = o.status as KanbanStatus;
      if (buckets[s]) buckets[s].push(o);
    }
    for (const k of KANBAN_STATUSES) {
      buckets[k].sort(sortOldestFirst);
    }
    return buckets;
  }, [data]);

  const errMsg = error instanceof Error ? error.message : error ? String(error) : null;

  if (restaurantId == null) {
    return <p className="text-sm text-text-muted">No restaurant assigned.</p>;
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h2 className="font-display font-semibold text-lg text-foreground">Live Orders</h2>
        {isFetching && !isLoading ? (
          <span className="text-xs font-medium text-text-muted">Refreshing…</span>
        ) : null}
      </div>
      <p className="mb-4 text-xs text-text-muted max-w-2xl">
        Moving a card notifies the customer by SMS when a phone is on the order; each successful SMS is billed to this
        restaurant per platform settings.
      </p>
      {errMsg && <p className="text-sm text-error mb-2">{errMsg}</p>}
      {isLoading && <p className="text-sm text-text-muted mb-4">Loading…</p>}
      {!isLoading && (
      <div className="rounded-xl border border-border bg-surface-alt/40 overflow-hidden">
        <div className="flex w-full min-h-[min(70vh,640px)] overflow-x-auto">
          {KANBAN_STATUSES.map((status, colIndex) => {
            const meta = COLUMN_META[status];
            const list = columns[status];
            return (
              <section
                key={status}
                className={`flex min-w-[240px] flex-1 flex-col border-border bg-background/80 ${colIndex > 0 ? "border-l-2" : ""}`}
              >
                <header
                  className={`sticky top-0 z-10 border-b border-border bg-card/95 px-3 py-2.5 backdrop-blur-sm border-l-4 ${meta.accent}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-sm font-semibold text-foreground">{meta.title}</h3>
                    <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-bold text-text-secondary tabular-nums">
                      {list.length}
                    </span>
                  </div>
                </header>
                <div className="flex min-h-[200px] flex-1 flex-col gap-2.5 overflow-y-auto p-2.5 max-lg:pb-[var(--app-mobile-bottom-nav-scroll-padding)]">
                  {list.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border/80 py-8 text-center">
                      <p className="text-xs font-medium text-text-muted">No orders</p>
                    </div>
                  ) : (
                    list.map((order) => {
                      const busy = transitionOrder.isPending && transitionOrder.variables?.orderId === order.id;
                      return (
                        <LiveOrderCard
                          key={order.id}
                          order={order}
                          busy={busy}
                          onTransition={(next, opts) =>
                            transitionOrder.mutate(
                              {
                                orderId: order.id,
                                status: next,
                                ...(opts?.rejectReason != null && opts.rejectReason !== ""
                                  ? { rejectReason: opts.rejectReason }
                                  : {}),
                              },
                              { onSuccess: () => opts?.onCommitted?.() },
                            )
                          }
                        />
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      )}
    </>
  );
}
