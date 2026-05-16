import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Search, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { usePendingPaymentAlerts, useRecordOrderPaymentSuccess } from "@/hooks/use-rest-api";
import { dueRemaining } from "@/lib/payment-alert-helpers";
import {
  type PaymentAlertOrder,
  type PaymentAlertOrderItem,
  type StaffPaymentRecordRow,
} from "@/components/staff/payment-alert-types";

export type { PaymentAlertOrder, PaymentAlertOrderItem, StaffPaymentRecordRow };

function formatMoney(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? Number.parseFloat(v) : v;
  if (Number.isNaN(n)) return "—";
  return `₹${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatChoiceLabel(raw: string | null | undefined): string {
  if (raw == null || raw === "") return "—";
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function customerLines(o: PaymentAlertOrder): { primary: string; secondary?: string } {
  const guestName = (o.guest_customer_name ?? "").trim();
  const guestPhone = (o.guest_customer_phone ?? "").trim();
  if (o.customer != null && (o.customer_name || o.customer_phone)) {
    const primary = o.customer_name?.trim() || "Registered customer";
    const phone = o.customer_phone?.trim();
    return phone ? { primary, secondary: phone } : { primary };
  }
  if (guestName || guestPhone) {
    const primary = guestName || "Guest";
    return guestPhone ? { primary, secondary: guestPhone } : { primary };
  }
  return { primary: "Walk-in" };
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

function orderMatchesQuery(o: PaymentAlertOrder, qRaw: string): boolean {
  const q = qRaw.trim().toLowerCase();
  if (!q) return true;
  const who = customerLines(o);
  const nameHay = `${who.primary} ${who.secondary ?? ""}`.toLowerCase();
  const phones = `${o.customer_phone ?? ""} ${o.guest_customer_phone ?? ""}`;
  const orderId = (o.order_id ?? "").toLowerCase();
  const qDigits = digitsOnly(q);
  const phoneDigits = digitsOnly(phones);
  return (
    nameHay.includes(q) ||
    orderId.includes(q) ||
    (qDigits.length > 0 && phoneDigits.includes(qDigits)) ||
    phones.toLowerCase().includes(q)
  );
}

/** Counter UI: only Pending vs Success. */
function paymentCounterLabel(o: PaymentAlertOrder): "Pending" | "Success" {
  const ps = (o.payment_status ?? "").toLowerCase();
  if (ps === "success") return "Success";
  return "Pending";
}

function Badge({ children, className }: { children: ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}

interface PaymentAlertsBoardProps {
  restaurantId: number;
}

export function PaymentAlertsBoard({ restaurantId }: PaymentAlertsBoardProps) {
  const { data: allOrders = [], isLoading, error } = usePendingPaymentAlerts(restaurantId, true);
  const recordPaid = useRecordOrderPaymentSuccess();
  const [search, setSearch] = useState("");
  const [markingId, setMarkingId] = useState<number | null>(null);
  const { requestConfirm, ConfirmDialog } = useConfirmAction();
  const deferredSearch = useDeferredValue(search);

  const orders = allOrders as PaymentAlertOrder[];

  const filtered = useMemo(
    () => orders.filter((o) => orderMatchesQuery(o, deferredSearch)),
    [orders, deferredSearch],
  );

  const markPaid = (o: PaymentAlertOrder) => {
    if (paymentCounterLabel(o) === "Success") return;
    const due = dueRemaining(o);
    if (due <= 0 && (o.payment_status ?? "").toLowerCase() !== "success") {
      toast.error("Nothing left to collect on this order.");
      return;
    }
    requestConfirm({
      title: "Mark payment received",
      message: `Mark order ${o.order_id} as paid (cash) for ${formatMoney(o.total)}?`,
      confirmLabel: "Mark paid",
      variant: "info",
      onConfirm: async () => {
        setMarkingId(o.id);
        try {
          await recordPaid.mutateAsync({ orderId: o.id, body: { channel: "cash" } });
          toast.success(`Payment marked success · ${o.order_id}`);
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setMarkingId(null);
        }
      },
    });
  };

  if (error) {
    return <p className="text-sm text-error p-4">Could not load payment alerts.</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 pb-8">
      <header className="sticky top-0 z-30 -mx-1 border-b border-border bg-background/95 px-1 pb-3 pt-1 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Store className="h-6 w-6" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
                MithoBasai payment alerts
              </h2>
              <p className="text-sm text-text-muted">
                Every order for this restaurant is listed. Tap once to mark payment success when the customer has
                paid.
              </p>
            </div>
          </div>
          <div className="relative w-full min-w-0 sm:max-w-md lg:w-80">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search order ID, name, or phone…"
              className="h-11 rounded-xl border-border pl-9 pr-3 text-base shadow-sm"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>
      </header>

      {recordPaid.isError ? (
        <p className="text-sm text-error bg-error/10 border border-error/30 rounded-xl px-4 py-3" role="alert">
          {(recordPaid.error as Error).message}
        </p>
      ) : null}

      {isLoading && <p className="text-sm text-text-muted">Loading…</p>}

      {!isLoading && orders.length === 0 && (
        <p className="text-sm text-text-muted bg-card border border-border rounded-2xl p-8 text-center">
          No orders yet. New orders will show up here automatically.
        </p>
      )}

      {!isLoading && orders.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-amber-900 dark:text-amber-100 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6">
          No rows match your search. Clear the box to see all orders.
        </p>
      )}

      {filtered.length > 0 ? (
        <div className="min-w-0 space-y-3">
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border bg-surface-alt/80 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  <tr>
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((o) => {
                    const who = customerLines(o);
                    const label = paymentCounterLabel(o);
                    const canMark = label === "Pending" && dueRemaining(o) > 0.0001;
                    const busy = markingId === o.id;
                    return (
                      <tr key={o.id} className="hover:bg-surface-alt/50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-foreground">{o.order_id}</td>
                        <td className="px-4 py-3 text-foreground">{formatChoiceLabel(o.order_type)}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{who.primary}</div>
                          {who.secondary ? (
                            <div className="font-mono text-xs text-text-secondary">{who.secondary}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatMoney(o.total)}</td>
                        <td className="px-4 py-3">
                          {label === "Success" ? (
                            <Badge className="bg-emerald-600/15 text-emerald-800 dark:text-emerald-200">Success</Badge>
                          ) : (
                            <Badge className="bg-slate-500/15 text-slate-800 dark:text-slate-200">Pending</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            type="button"
                            size="sm"
                            className="h-9 min-w-[7.5rem] rounded-lg font-semibold"
                            disabled={!canMark || busy}
                            onClick={() => void markPaid(o)}
                          >
                            {busy ? "Saving…" : label === "Success" ? "Paid" : "Mark paid"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <ul className="grid gap-3 md:hidden">
            {filtered.map((o) => {
              const who = customerLines(o);
              const label = paymentCounterLabel(o);
              const canMark = label === "Pending" && dueRemaining(o) > 0.0001;
              const busy = markingId === o.id;
              return (
                <li
                  key={o.id}
                  className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold text-foreground">{o.order_id}</p>
                      <p className="text-sm text-text-secondary">{formatChoiceLabel(o.order_type)}</p>
                      <p className="mt-1 font-medium text-foreground">{who.primary}</p>
                      {who.secondary ? (
                        <p className="text-sm font-mono text-text-muted">{who.secondary}</p>
                      ) : null}
                    </div>
                    {label === "Success" ? (
                      <Badge className="bg-emerald-600/15 text-emerald-800 dark:text-emerald-200">Success</Badge>
                    ) : (
                      <Badge className="bg-slate-500/15 text-slate-800 dark:text-slate-200">Pending</Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                    <span className="text-sm text-text-muted">Total</span>
                    <span className="text-lg font-bold tabular-nums">{formatMoney(o.total)}</span>
                  </div>
                  <Button
                    type="button"
                    className="w-full h-11 rounded-xl font-semibold"
                    disabled={!canMark || busy}
                    onClick={() => void markPaid(o)}
                  >
                    {busy ? "Saving…" : label === "Success" ? "Already paid" : "Mark paid"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {ConfirmDialog}
    </div>
  );
}
