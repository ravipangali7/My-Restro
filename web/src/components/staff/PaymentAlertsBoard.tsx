import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "@tanstack/react-router";
import QRCode from "qrcode";
import { toast } from "sonner";
import {
  AlertTriangle,
  Banknote,
  Camera,
  Download,
  Eye,
  LayoutGrid,
  QrCode,
  Search,
  Store,
} from "lucide-react";

import { OrderTableVisual } from "@/components/shared/OrderTableVisual";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useCustomerOrderHistory,
  useDismissProximityAlert,
  usePendingPaymentAlerts,
  useRecordOrderPaymentSuccess,
} from "@/hooks/use-rest-api";
import { downloadOrderBillImage } from "@/lib/order-bill";
import {
  countCounterCollectionOpen,
  dedupeDisplayOrders,
  dueRemaining,
  orderNeedsCounterCollection,
  paidSoFar,
} from "@/lib/payment-alert-helpers";
import { STAFF_PATH } from "@/lib/portal-routes";
import { ScanAddToBillDialog, type ScanAddSessionEvent } from "@/components/staff/ScanAddToBillDialog";
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
  return { primary: "Walk-in / not on file" };
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

function paymentBadge(o: PaymentAlertOrder): { label: string; className: string } {
  const ps = (o.payment_status ?? "").toLowerCase();
  const pm = (o.payment_method ?? "").toLowerCase();
  if (ps === "success") {
    if (pm === "qr") return { label: "Paid · QR", className: "bg-emerald-600/15 text-emerald-800 dark:text-emerald-200" };
    if (pm === "cash") return { label: "Paid · Cash", className: "bg-emerald-600/15 text-emerald-800 dark:text-emerald-200" };
    if (pm === "e_wallet") return { label: "Paid · Online", className: "bg-emerald-600/15 text-emerald-800 dark:text-emerald-200" };
    return { label: "Paid", className: "bg-emerald-600/15 text-emerald-800 dark:text-emerald-200" };
  }
  if (ps === "partial") {
    return { label: "Partial", className: "bg-amber-500/20 text-amber-900 dark:text-amber-100" };
  }
  if (ps === "failed") {
    return { label: "Failed", className: "bg-rose-500/15 text-rose-900 dark:text-rose-100" };
  }
  return { label: "Pending", className: "bg-slate-500/15 text-slate-800 dark:text-slate-200" };
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
  const dismiss = useDismissProximityAlert();
  const recordPaid = useRecordOrderPaymentSuccess();
  const panelRef = useRef<HTMLDivElement | null>(null);

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const [panelOrderId, setPanelOrderId] = useState<number | null>(null);
  const [panelTab, setPanelTab] = useState<"details" | "qr" | "cash" | "history">("details");
  const [cashInput, setCashInput] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [scanAddOpen, setScanAddOpen] = useState(false);
  const [scanSessionLog, setScanSessionLog] = useState<ScanAddSessionEvent[]>([]);

  const orders = allOrders as PaymentAlertOrder[];

  const openCounterCount = useMemo(() => countCounterCollectionOpen(orders), [orders]);

  const displayOrders = useMemo(() => dedupeDisplayOrders(orders), [orders]);
  const filtered = useMemo(
    () => displayOrders.filter((o) => orderMatchesQuery(o, deferredSearch)),
    [displayOrders, deferredSearch],
  );

  const selected = useMemo(
    () => (panelOrderId != null ? orders.find((o) => o.id === panelOrderId) ?? null : null),
    [orders, panelOrderId],
  );

  const needsCounterForSelected = selected != null && orderNeedsCounterCollection(selected);

  const historyGuestPhone =
    selected != null && selected.customer == null
      ? String(selected.guest_customer_phone ?? "").trim()
      : "";
  const { data: customerHistory = [], isLoading: historyLoading } = useCustomerOrderHistory(
    restaurantId,
    selected?.customer ?? null,
    historyGuestPhone || undefined,
    selected != null &&
      panelTab === "history" &&
      (selected.customer != null || historyGuestPhone.length > 0),
  );
  const historyOrders = customerHistory as PaymentAlertOrder[];

  useEffect(() => {
    if (panelOrderId != null && !orders.some((o) => o.id === panelOrderId)) {
      setPanelOrderId(null);
    }
  }, [orders, panelOrderId]);

  useEffect(() => {
    if (selected == null) return;
    if (!orderNeedsCounterCollection(selected) && (panelTab === "qr" || panelTab === "cash")) {
      setPanelTab("details");
    }
  }, [selected, panelTab]);

  useEffect(() => {
    if (panelOrderId == null) return;
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [panelOrderId, panelTab]);

  const openPanel = useCallback((o: PaymentAlertOrder, tab: typeof panelTab) => {
    setPanelOrderId(o.id);
    setPanelTab(tab);
    const due = dueRemaining(o);
    setCashInput(due > 0 ? due.toFixed(2) : "");
  }, []);

  const remainingForSelected = selected ? dueRemaining(selected) : 0;

  useEffect(() => {
    let cancelled = false;
    if (!selected || panelTab !== "qr") {
      setQrDataUrl(null);
      return;
    }
    const restaurantName = selected.restaurant_name ?? "Restaurant";
    const payload = [
      `MyRestro — ${restaurantName}`,
      `Order: ${selected.order_id}`,
      `Balance due: ${formatMoney(remainingForSelected)}`,
      "",
      "Pay with your UPI app, then ask the cashier to confirm on their screen.",
    ].join("\n");
    void QRCode.toDataURL(payload, { width: 240, margin: 2, errorCorrectionLevel: "M" }).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [selected, panelTab, remainingForSelected]);

  const tryDownloadBill = async (orderId: number, orderIdLabel: string) => {
    setDownloading(true);
    try {
      await downloadOrderBillImage(orderId, orderIdLabel);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  /**
   * Close the full balance using cash: cashier must have typed at least the amount due
   * (e.g. change given back). Then mark paid, refresh bill, and download.
   */
  const applyCashToBill = async () => {
    if (!selected) return;
    const due = dueRemaining(selected);
    const n = Number.parseFloat(cashInput.replace(/,/g, ""));
    if (!Number.isFinite(n) || n < due - 0.005) {
      toast.error(`Enter at least the balance due (${formatMoney(due)}) to close this bill with cash.`);
      return;
    }
    const id = selected.id;
    const label = selected.order_id;
    try {
      const updated = (await recordPaid.mutateAsync({ orderId: id, body: { channel: "cash" } })) as PaymentAlertOrder;
      toast.success("Full balance marked paid (cash).");
      if ((updated.payment_status ?? "").toLowerCase() === "success") {
        await tryDownloadBill(id, label);
        setPanelOrderId(null);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const confirmQrPaid = async () => {
    if (!selected) return;
    const id = selected.id;
    const label = selected.order_id;
    try {
      const updated = (await recordPaid.mutateAsync({
        orderId: id,
        body: { channel: "qr" },
      })) as PaymentAlertOrder;
      toast.success("QR / UPI payment marked complete.");
      if ((updated.payment_status ?? "").toLowerCase() === "success") {
        await tryDownloadBill(id, label);
        setPanelOrderId(null);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const payFullCash = async () => {
    if (!selected) return;
    const id = selected.id;
    const label = selected.order_id;
    try {
      const updated = (await recordPaid.mutateAsync({ orderId: id, body: { channel: "cash" } })) as PaymentAlertOrder;
      toast.success("Full balance paid (cash).");
      if ((updated.payment_status ?? "").toLowerCase() === "success") {
        await tryDownloadBill(id, label);
        setPanelOrderId(null);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
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
              <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">Payment counter</h2>
              <p className="text-sm text-text-muted">
                POS-style billing: search a bill, take QR or cash, and confirm without leaving this page.
              </p>
            </div>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end lg:w-auto">
            <div className="relative w-full min-w-[min(100%,18rem)] sm:max-w-md lg:w-80">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, phone, or order ID…"
                className="h-11 rounded-xl border-border pl-9 pr-3 text-base shadow-sm"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <Button
              type="button"
              className="h-11 shrink-0 rounded-xl gap-2 order-first sm:order-none"
              onClick={() => setScanAddOpen(true)}
            >
              <Camera className="h-4 w-4" aria-hidden />
              Scan &amp; add
            </Button>
            <Button variant="outline" className="h-11 shrink-0 rounded-xl" asChild>
              <Link to={STAFF_PATH.cashierDashboard}>Dashboard</Link>
            </Button>
          </div>
        </div>
      </header>

      <ScanAddToBillDialog
        open={scanAddOpen}
        onOpenChange={setScanAddOpen}
        restaurantId={restaurantId}
        openOrders={displayOrders}
        defaultOrderId={selected?.id ?? null}
        onItemAdded={(e) => setScanSessionLog((prev) => [e, ...prev].slice(0, 25))}
      />

      {scanSessionLog.length > 0 ? (
        <div className="rounded-2xl border border-border bg-card/80 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">This session — scan &amp; add</p>
          <ul className="mt-2 space-y-1.5 text-sm text-text-secondary max-h-40 overflow-y-auto">
            {scanSessionLog.map((row, i) => (
              <li key={`${row.at}-${i}`} className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-foreground min-w-0 break-words">{row.lineLabel}</span>
                <span className="shrink-0 text-xs text-text-muted font-mono">
                  {row.orderIdLabel} · {row.source} · {new Date(row.at).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {recordPaid.isError ? (
        <p className="text-sm text-error bg-error/10 border border-error/30 rounded-xl px-4 py-3" role="alert">
          {(recordPaid.error as Error).message}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Queue</p>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">{displayOrders.length}</p>
          <p className="text-xs text-text-secondary">
            {openCounterCount} need collection · latest bill per customer (rows stay after payment)
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Matches</p>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">{filtered.length}</p>
          <p className="text-xs text-text-secondary">After search filter</p>
        </div>
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 shadow-sm sm:flex sm:items-center sm:gap-3">
          <AlertTriangle className="hidden h-8 w-8 shrink-0 text-amber-600 sm:block" aria-hidden />
          <div>
            <p className="font-semibold text-foreground">Live refresh</p>
            <p className="text-xs text-text-secondary">List syncs every few seconds in the background.</p>
          </div>
        </div>
      </div>

      {isLoading && <p className="text-sm text-text-muted">Loading…</p>}

      {!isLoading && orders.length === 0 && (
        <p className="text-sm text-text-muted bg-card border border-border rounded-2xl p-8 text-center">
          No pending payments. New unpaid orders will appear here automatically.
        </p>
      )}

      {!isLoading && orders.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-amber-900 dark:text-amber-100 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6">
          No rows match <span className="font-mono font-semibold">{search.trim() || "·"}</span>. Clear the search box
          to see all open bills.
        </p>
      )}

      {filtered.length > 0 || selected != null ? (
        <div
          className={`grid min-w-0 gap-4 w-full ${
            selected && filtered.length > 0 ? "lg:grid-cols-2" : "grid-cols-1"
          }`}
        >
          {filtered.length > 0 ? (
            <div className="min-w-0 space-y-3 self-start">
              <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="border-b border-border bg-surface-alt/80 text-xs font-semibold uppercase tracking-wide text-text-muted">
                      <tr>
                        <th className="px-4 py-3">Customer</th>
                        <th className="px-4 py-3">Phone</th>
                        <th className="px-4 py-3">Order</th>
                        <th className="px-4 py-3 text-right">Due</th>
                        <th className="px-4 py-3 text-right">Paid</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filtered.map((o) => {
                        const who = customerLines(o);
                        const badge = paymentBadge(o);
                        const due = dueRemaining(o);
                        const paid = paidSoFar(o);
                        const needsCollection = orderNeedsCounterCollection(o);
                        return (
                          <tr key={o.id} className="hover:bg-surface-alt/50 transition-colors">
                            <td className="px-4 py-3 font-medium text-foreground">{who.primary}</td>
                            <td className="px-4 py-3 font-mono text-text-secondary">{who.secondary ?? "—"}</td>
                            <td className="px-4 py-3 font-mono text-xs text-foreground">{o.order_id}</td>
                            <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatMoney(due)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                              {formatMoney(paid)}
                            </td>
                            <td className="px-4 py-3">
                              <Badge className={badge.className}>{badge.label}</Badge>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-1.5">
                                {needsCollection ? (
                                  <>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-8 rounded-lg gap-1"
                                      onClick={() => openPanel(o, "qr")}
                                    >
                                      <QrCode className="h-3.5 w-3.5" />
                                      QR
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-8 rounded-lg gap-1"
                                      onClick={() => openPanel(o, "cash")}
                                    >
                                      <Banknote className="h-3.5 w-3.5" />
                                      Cash
                                    </Button>
                                  </>
                                ) : null}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  className="h-8 rounded-lg gap-1"
                                  onClick={() => openPanel(o, "details")}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  View
                                </Button>
                              </div>
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
                  const badge = paymentBadge(o);
                  const due = dueRemaining(o);
                  const paid = paidSoFar(o);
                  const needsCollection = orderNeedsCounterCollection(o);
                  return (
                    <li
                      key={o.id}
                      className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-foreground">{who.primary}</p>
                          <p className="text-sm font-mono text-text-secondary">{who.secondary ?? "—"}</p>
                          <p className="mt-1 font-mono text-xs text-text-muted">{o.order_id}</p>
                        </div>
                        <Badge className={badge.className}>{badge.label}</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-xl bg-surface-alt/60 p-3">
                          <p className="text-xs text-text-muted">Due</p>
                          <p className="font-bold tabular-nums">{formatMoney(due)}</p>
                        </div>
                        <div className="rounded-xl bg-surface-alt/60 p-3">
                          <p className="text-xs text-text-muted">Paid</p>
                          <p className="font-semibold tabular-nums text-text-secondary">{formatMoney(paid)}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {needsCollection ? (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              className="flex-1 rounded-xl gap-1"
                              onClick={() => openPanel(o, "qr")}
                            >
                              <QrCode className="h-4 w-4" />
                              QR Pay
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="flex-1 rounded-xl gap-1"
                              onClick={() => openPanel(o, "cash")}
                            >
                              <Banknote className="h-4 w-4" />
                              Cash
                            </Button>
                          </>
                        ) : null}
                        <Button
                          type="button"
                          variant="secondary"
                          className="w-full rounded-xl gap-1"
                          onClick={() => openPanel(o, "details")}
                        >
                          <Eye className="h-4 w-4" />
                          View bill
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {selected != null && panelOrderId != null ? (
            <div
              ref={panelRef}
              className="min-h-0 max-h-[min(85vh,900px)] overflow-y-auto rounded-2xl border border-border bg-card shadow-md lg:max-h-[calc(100vh-6rem)]"
            >
              <div className="border-b border-border bg-surface-alt/50 p-4 sm:p-5 text-left">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-primary">
                      <LayoutGrid className="h-5 w-5 shrink-0" aria-hidden />
                      <span className="text-xs font-bold uppercase tracking-wider">Billing (this page)</span>
                    </div>
                    <h3 className="mt-1 font-mono text-lg text-foreground">{selected.order_id}</h3>
                    <p className="text-sm text-text-secondary">
                      {customerLines(selected).primary}
                      {customerLines(selected).secondary ? ` · ${customerLines(selected).secondary}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 rounded-lg"
                    onClick={() => setPanelOrderId(null)}
                  >
                    Close
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge className={paymentBadge(selected).className}>{paymentBadge(selected).label}</Badge>
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    Due {formatMoney(remainingForSelected)}
                  </span>
                  <span className="text-sm tabular-nums text-text-muted">Paid {formatMoney(paidSoFar(selected))}</span>
                </div>
              </div>

              <Tabs
                value={panelTab}
                onValueChange={(v) => setPanelTab(v as typeof panelTab)}
                className="p-4 sm:px-5"
              >
                <TabsList className="grid w-full grid-cols-4 rounded-xl bg-surface-alt p-1">
                  <TabsTrigger value="details" className="rounded-lg text-xs sm:text-sm">
                    Details
                  </TabsTrigger>
                  <TabsTrigger
                    value="qr"
                    className="rounded-lg text-xs sm:text-sm"
                    disabled={!needsCounterForSelected}
                  >
                    QR
                  </TabsTrigger>
                  <TabsTrigger
                    value="cash"
                    className="rounded-lg text-xs sm:text-sm"
                    disabled={!needsCounterForSelected}
                  >
                    Cash
                  </TabsTrigger>
                  <TabsTrigger value="history" className="rounded-lg text-xs sm:text-sm">
                    History
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="mt-4 space-y-4 pb-6">
                  <div className="rounded-xl border border-border p-3 text-sm">
                    <p className="text-xs font-semibold uppercase text-text-muted">Customer</p>
                    <p className="mt-1 font-medium text-foreground">{customerLines(selected).primary}</p>
                    <p className="text-text-secondary font-mono text-sm">
                      {customerLines(selected).secondary ?? "—"}
                    </p>
                    <p className="mt-2 text-xs text-text-muted">
                      <span className="font-medium text-foreground">Method (recorded on order): </span>
                      {formatChoiceLabel(selected.payment_method)} · {formatChoiceLabel(selected.payment_status)}
                    </p>
                    <p className="text-xs text-text-muted">
                      <span className="font-medium text-foreground">People: </span>
                      {selected.people_for}
                    </p>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-border p-3">
                      <dt className="text-xs text-text-muted">Type</dt>
                      <dd className="font-medium">{formatChoiceLabel(selected.order_type)}</dd>
                    </div>
                    <div className="rounded-xl border border-border p-3">
                      <dt className="text-xs text-text-muted">Table</dt>
                      <dd className="font-medium">
                        <OrderTableVisual
                          tableName={selected.table_name}
                          tableId={selected.table}
                          tableImage={selected.table_image}
                          compact
                        />
                      </dd>
                    </div>
                    <div className="rounded-xl border border-border p-3">
                      <dt className="text-xs text-text-muted">Kitchen</dt>
                      <dd className="font-medium">{formatChoiceLabel(selected.status)}</dd>
                    </div>
                    <div className="rounded-xl border border-border p-3">
                      <dt className="text-xs text-text-muted">Placed</dt>
                      <dd className="font-medium text-xs sm:text-sm">
                        {new Date(selected.created_at).toLocaleString()}
                      </dd>
                    </div>
                    {selected.updated_at ? (
                      <div className="rounded-xl border border-border p-3 col-span-2">
                        <dt className="text-xs text-text-muted">Last updated</dt>
                        <dd className="font-medium text-sm">{new Date(selected.updated_at).toLocaleString()}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {selected.address?.trim() ? (
                    <div className="text-sm rounded-xl border border-border p-3">
                      <p className="text-xs font-semibold text-text-muted">Address</p>
                      <p className="text-text-secondary mt-1 whitespace-pre-wrap">{selected.address.trim()}</p>
                    </div>
                  ) : null}
                  <div>
                    <p className="text-xs font-semibold uppercase text-text-muted mb-2">Line items</p>
                    {selected.items?.length ? (
                      <ul className="space-y-2 text-sm">
                        {selected.items.map((it) => {
                          const label = it.line_label || `Item #${it.id}`;
                          return (
                            <li
                              key={it.id}
                              className="flex items-start justify-between gap-2 rounded-lg border border-border/80 bg-surface-alt/40 px-3 py-2"
                            >
                              <span className="min-w-0 break-words leading-snug text-foreground">{label}</span>
                              <div className="shrink-0 text-right text-xs sm:text-sm">
                                <span className="tabular-nums">×{String(it.quantity)}</span>
                                <p className="text-text-muted">@ {formatMoney(it.price)}</p>
                                <p className="font-medium tabular-nums">{formatMoney(it.total)}</p>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="text-sm text-text-muted">No line items.</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-border p-4 space-y-2">
                    <p className="text-xs font-semibold uppercase text-text-muted">Totals</p>
                    <div className="flex justify-between text-sm">
                      <span className="text-text-muted">Subtotal</span>
                      <span className="font-medium tabular-nums">{formatMoney(selected.sub_total)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-text-muted">Discount</span>
                      <span className="font-medium tabular-nums">{formatMoney(selected.discount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-text-muted">Delivery</span>
                      <span className="font-medium tabular-nums">{formatMoney(selected.delivery_fee)}</span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
                      <span>Bill total</span>
                      <span className="tabular-nums">{formatMoney(selected.total)}</span>
                    </div>
                    <div className="flex justify-between text-sm pt-1">
                      <span className="text-text-muted">Amount paid (counter)</span>
                      <span className="font-medium tabular-nums">{formatMoney(selected.amount_paid ?? 0)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-text-muted">Amount remaining</span>
                      <span className="font-medium tabular-nums">{formatMoney(remainingForSelected)}</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full min-h-11 gap-2 rounded-xl"
                    disabled={downloading}
                    onClick={() => void tryDownloadBill(selected.id, selected.order_id)}
                  >
                    <Download className="h-4 w-4" />
                    {downloading ? "Preparing…" : "Download bill (PNG)"}
                  </Button>
                </TabsContent>

                <TabsContent value="qr" className="mt-4 space-y-4 pb-6">
                  <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-6">
                    {qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        width={240}
                        height={240}
                        className="rounded-xl bg-white p-2 shadow"
                        alt="Payment QR code"
                      />
                    ) : (
                      <div className="flex h-60 w-60 items-center justify-center rounded-xl bg-card text-sm text-text-muted">
                        Generating QR…
                      </div>
                    )}
                    <p className="text-center text-sm text-text-secondary max-w-xs">
                      Customer scans this code. After their UPI transfer succeeds, tap confirm below to close the bill and
                      post income.
                    </p>
                    <Button
                      type="button"
                      className="w-full max-w-sm rounded-xl h-11 font-semibold"
                      disabled={recordPaid.isPending || remainingForSelected <= 0}
                      onClick={() => void confirmQrPaid()}
                    >
                      {recordPaid.isPending ? "Saving…" : "Confirm QR / UPI received"}
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="cash" className="mt-4 space-y-4 pb-6">
                  <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                    <div>
                      <label htmlFor="cash-amount" className="text-sm font-medium text-foreground">
                        Cash received (₹)
                      </label>
                      <Input
                        id="cash-amount"
                        inputMode="decimal"
                        className="mt-2 h-11 rounded-xl text-lg font-semibold tabular-nums"
                        value={cashInput}
                        onChange={(e) => setCashInput(e.target.value)}
                      />
                      <p className="mt-1 text-xs text-text-muted">
                        Balance due: {formatMoney(remainingForSelected)}. To <strong>Apply cash to bill</strong>, enter
                        an amount of at least the balance due; the system records the full remaining amount and
                        marks the order paid, then saves the bill image for download.
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        variant="default"
                        className="flex-1 rounded-xl h-11 font-semibold"
                        disabled={recordPaid.isPending || remainingForSelected <= 0}
                        onClick={() => void applyCashToBill()}
                      >
                        {recordPaid.isPending ? "Saving…" : "Apply cash to bill"}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="flex-1 rounded-xl h-11 font-semibold"
                        disabled={recordPaid.isPending || remainingForSelected <= 0}
                        onClick={() => void payFullCash()}
                      >
                        {recordPaid.isPending ? "Saving…" : "Pay full balance (cash)"}
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="history" className="mt-4 space-y-4 pb-6">
                  {selected.customer == null && !historyGuestPhone ? (
                    <p className="text-sm text-text-muted">
                      History needs a customer account or a guest phone on this order.
                    </p>
                  ) : historyLoading ? (
                    <p className="text-sm text-text-muted">Loading history…</p>
                  ) : historyOrders.length === 0 ? (
                    <p className="text-sm text-text-muted">No other orders for this contact.</p>
                  ) : (
                    <ul className="space-y-4">
                      {historyOrders.map((ho) => {
                        const lines = customerLines(ho);
                        return (
                          <li
                            key={ho.id}
                            className="overflow-hidden rounded-xl border border-border bg-surface-alt/30 text-sm"
                          >
                            <div className="border-b border-border/60 bg-surface-alt/50 px-3 py-2 space-y-1">
                              <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <span className="font-mono font-semibold text-foreground">{ho.order_id}</span>
                                <span className="text-xs text-text-muted">
                                  {new Date(ho.created_at).toLocaleString()}
                                </span>
                              </div>
                              <p className="text-text-secondary text-xs">
                                {lines.primary}
                                {lines.secondary ? ` · ${lines.secondary}` : ""} · {formatChoiceLabel(ho.order_type)} ·{" "}
                                {formatChoiceLabel(ho.status)} · payment {formatChoiceLabel(ho.payment_status)} (
                                {formatChoiceLabel(ho.payment_method)})
                              </p>
                            </div>
                            <div className="space-y-2 p-3">
                              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                                <div>
                                  <p className="text-text-muted">Subtotal</p>
                                  <p className="tabular-nums font-medium">{formatMoney(ho.sub_total)}</p>
                                </div>
                                <div>
                                  <p className="text-text-muted">Discount</p>
                                  <p className="tabular-nums font-medium">{formatMoney(ho.discount)}</p>
                                </div>
                                <div>
                                  <p className="text-text-muted">Delivery</p>
                                  <p className="tabular-nums font-medium">{formatMoney(ho.delivery_fee)}</p>
                                </div>
                                <div>
                                  <p className="text-text-muted">Total / paid</p>
                                  <p className="tabular-nums font-medium">
                                    {formatMoney(ho.total)} / {formatMoney(ho.amount_paid ?? 0)}
                                  </p>
                                </div>
                              </div>
                              {ho.items?.length ? (
                                <ul className="border-t border-border/60 pt-2 space-y-1 text-xs text-text-secondary">
                                  {ho.items.map((it) => (
                                    <li key={it.id} className="flex justify-between gap-2">
                                      <span className="min-w-0 break-words">{it.line_label || `Item #${it.id}`}</span>
                                      <span className="shrink-0 tabular-nums">
                                        ×{String(it.quantity)} · {formatMoney(it.total)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                              {ho.staff_payment_records && ho.staff_payment_records.length > 0 ? (
                                <div className="border-t border-border/60 pt-2">
                                  <p className="text-xs font-semibold text-text-muted">Counter payments</p>
                                  <ul className="mt-1 space-y-1 text-xs">
                                    {ho.staff_payment_records.map((r) => (
                                      <li key={r.id} className="flex justify-between text-text-secondary">
                                        <span>
                                          {formatMoney(r.amount)} {formatChoiceLabel(r.channel)}
                                          {r.recorded_by_name ? ` · ${r.recorded_by_name}` : ""}
                                        </span>
                                        <span className="shrink-0">{new Date(r.created_at).toLocaleString()}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </TabsContent>
              </Tabs>

              <div className="mt-auto border-t border-border bg-surface-alt/40 p-4 flex flex-col gap-2">
                {selected.proximity_unpaid_alert_at ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full rounded-xl"
                    disabled={dismiss.isPending}
                    onClick={() =>
                      void dismiss
                        .mutateAsync(selected.id)
                        .then(() => toast.success("Proximity alert cleared."))
                        .catch((e: Error) => toast.error(e.message))
                    }
                  >
                    {dismiss.isPending ? "Clearing…" : "Dismiss proximity alert"}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
