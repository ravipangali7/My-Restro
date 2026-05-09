import type { PaymentAlertOrder } from "@/components/staff/payment-alert-types";

function parseAmount(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return Number.NaN;
  const n = typeof v === "string" ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? n : Number.NaN;
}

export function dueRemaining(o: PaymentAlertOrder): number {
  const fromApi = parseAmount(o.amount_remaining ?? null);
  if (Number.isFinite(fromApi)) return Math.max(fromApi, 0);
  const total = parseAmount(o.total);
  const paid = parseAmount(o.amount_paid ?? 0);
  if (!Number.isFinite(total)) return 0;
  return Math.max(total - (Number.isFinite(paid) ? paid : 0), 0);
}

export function paidSoFar(o: PaymentAlertOrder): number {
  const p = parseAmount(o.amount_paid ?? 0);
  return Number.isFinite(p) ? Math.max(p, 0) : 0;
}

/** True when the counter should show QR / cash collection for this order. */
export function orderNeedsCounterCollection(o: PaymentAlertOrder): boolean {
  if (dueRemaining(o) > 0.0001) return true;
  return (o.payment_status ?? "").toLowerCase() !== "success";
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

function customerDedupeKey(o: PaymentAlertOrder): string {
  if (o.customer != null) return `c:${o.customer}`;
  const ph = digitsOnly(String(o.guest_customer_phone ?? ""));
  if (ph) return `p:${ph}`;
  const nm = (o.guest_customer_name ?? "").trim().toLowerCase();
  if (nm) return `n:${nm}`;
  return `o:${o.id}`;
}

/** Newest order per customer (aligns with server `payment-pending-alerts` rows). */
export function dedupeDisplayOrders(orders: PaymentAlertOrder[]): PaymentAlertOrder[] {
  const byTime = [...orders].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const seen = new Set<string>();
  const out: PaymentAlertOrder[] = [];
  for (const o of byTime) {
    const k = customerDedupeKey(o);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(o);
  }
  return out;
}

/** Count of rows that still need QR/cash (or other non-settled) attention. */
export function countCounterCollectionOpen(orders: PaymentAlertOrder[]): number {
  return orders.filter((o) => orderNeedsCounterCollection(o)).length;
}
