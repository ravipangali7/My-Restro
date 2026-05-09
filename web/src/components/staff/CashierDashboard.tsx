import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Banknote,
  BookOpen,
  Camera,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  QrCode,
  TrendingUp,
  User,
} from "lucide-react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CashierScanRawMaterialDialog } from "@/components/staff/CashierScanRawMaterialDialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { useLedgers, useOrders, usePendingPaymentAlerts, useTransactions } from "@/hooks/use-rest-api";
import type { PaymentAlertOrder } from "@/components/staff/payment-alert-types";
import { countCounterCollectionOpen, orderNeedsCounterCollection } from "@/lib/payment-alert-helpers";
import { STAFF_PATH } from "@/lib/portal-routes";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { cn } from "@/lib/utils";

const PREVIEW_ROWS = 5;
const CHART_ACCENT = "#d97706";

interface OrderRow {
  id: number;
  order_id: string;
  status: string;
  payment_status?: string;
  total?: string | number;
  created_at?: string | null;
  order_type?: string | null;
  table?: number | null;
}

interface ProximityAlertOrder {
  id: number;
  order_id: string;
  status: string;
  payment_status: string;
  total: string | number;
  created_at: string;
  proximity_unpaid_alert_at: string | null;
  guest_customer_name: string;
  customer_name: string | null;
}

interface LedgerRow {
  id: number;
  particular: string;
  amount: string | number;
  type: string;
}

interface TxRow {
  id: number;
  amount: string | number;
  payment_status: string;
  transaction_type: string;
  category: string;
  remarks: string;
}

function formatInr(n: number): string {
  return `₹${Number(n).toLocaleString()}`;
}

const chartTooltip = {
  contentStyle: {
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--foreground)",
    boxShadow: "0 12px 40px rgba(26, 26, 26, 0.08)",
    fontSize: 12,
    padding: "8px 12px",
  },
};

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/90">{eyebrow}</p>
        ) : null}
        <h3 className="font-display text-lg font-bold tracking-tight text-foreground sm:text-xl">{title}</h3>
        {description ? <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-secondary">{description}</p> : null}
      </div>
      <div
        className="hidden h-px shrink-0 bg-gradient-to-r from-primary/30 via-primary/10 to-transparent sm:block sm:w-32 sm:self-center"
        aria-hidden
      />
    </div>
  );
}

function StatFrame({ accentClass, children }: { accentClass: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-gradient-to-br p-[1px] shadow-sm transition-all duration-300 hover:shadow-md",
        accentClass,
      )}
    >
      {children}
    </div>
  );
}

function TableShell({
  title,
  seeAllTo,
  seeAllLabel,
  onSeeAll,
  rowCount,
  totalCount,
  children,
}: {
  title: string;
  seeAllTo?: string;
  seeAllLabel?: string;
  onSeeAll?: () => void;
  rowCount: number;
  totalCount: number;
  children: ReactNode;
}) {
  const showSeeAll = totalCount > PREVIEW_ROWS;
  const seeAllText = seeAllLabel ?? "See All";

  return (
    <div className="overflow-hidden rounded-2xl border border-border/90 bg-card shadow-sm ring-1 ring-black/[0.02] transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between gap-3 border-b border-border/80 bg-gradient-to-r from-muted/40 via-transparent to-amber-50/25 px-4 py-3.5 sm:px-5">
        <h3 className="font-display text-sm font-bold tracking-tight text-foreground">{title}</h3>
        {showSeeAll ? (
          seeAllTo ? (
            <Link
              to={seeAllTo}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/20 bg-primary-50/90 px-3 py-1 text-xs font-bold text-primary transition-colors hover:bg-primary-100 hover:border-primary/35"
            >
              {seeAllText}
              <ChevronRight className="size-3.5 opacity-80" aria-hidden />
            </Link>
          ) : (
            <button
              type="button"
              onClick={onSeeAll}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/20 bg-primary-50/90 px-3 py-1 text-xs font-bold text-primary transition-colors hover:bg-primary-100 hover:border-primary/35"
            >
              {seeAllText}
              <ChevronRight className="size-3.5 opacity-80" aria-hidden />
            </button>
          )
        ) : null}
      </div>
      {rowCount === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-text-muted">No records yet.</p>
      ) : (
        <div className="overflow-x-auto">{children}</div>
      )}
      {showSeeAll ? (
        <p className="border-t border-border/80 bg-muted/25 px-4 py-2.5 text-center text-[11px] font-medium text-text-muted sm:px-5 sm:text-left">
          Showing {Math.min(PREVIEW_ROWS, rowCount)} of {totalCount}
        </p>
      ) : null}
    </div>
  );
}

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  success: "#16a34a",
  failed: "#ef4444",
  refunded: "#64748b",
  other: "#8b5cf6",
};

export function CashierDashboard() {
  const { user } = useAuth();
  const { restaurantId } = useRestaurantScope();
  const partyId = user != null ? String(user.id) : null;

  const { data: orders = [], isLoading: loadingOrders } = useOrders(restaurantId, { refetchInterval: 12_000 });
  const { data: pendingPaymentsRaw = [], isLoading: loadingPendingPayments } = usePendingPaymentAlerts(
    restaurantId,
    true,
  );
  const { data: ledger = [], isLoading: loadingLedger } = useLedgers(restaurantId, "staff", partyId);
  const { data: transactions = [], isLoading: loadingTx } = useTransactions(restaurantId);

  const [unpaidOrdersDialogOpen, setUnpaidOrdersDialogOpen] = useState(false);
  const [rawMaterialScanOpen, setRawMaterialScanOpen] = useState(false);

  const orderRows = orders as OrderRow[];
  const ledgerRows = ledger as LedgerRow[];
  const txRows = transactions as TxRow[];

  const pendingPaymentRows = pendingPaymentsRaw as ProximityAlertOrder[];

  const openCounterAlertCount = useMemo(
    () => countCounterCollectionOpen(pendingPaymentRows as unknown as PaymentAlertOrder[]),
    [pendingPaymentRows],
  );

  const pendingNeedingCollection = useMemo(
    () => pendingPaymentRows.filter((o) => orderNeedsCounterCollection(o as unknown as PaymentAlertOrder)),
    [pendingPaymentRows],
  );

  const sortedPendingPayments = useMemo(() => {
    return [...pendingNeedingCollection].sort((a, b) => {
      const ta = Date.parse(String(a.proximity_unpaid_alert_at ?? a.created_at ?? ""));
      const tb = Date.parse(String(b.proximity_unpaid_alert_at ?? b.created_at ?? ""));
      if (tb !== ta) return tb - ta;
      return b.id - a.id;
    });
  }, [pendingNeedingCollection]);

  const sortedAlerts = sortedPendingPayments;

  const sortedUnpaidOrders = sortedPendingPayments as unknown as OrderRow[];

  const sortedLedger = useMemo(() => [...ledgerRows].sort((a, b) => b.id - a.id), [ledgerRows]);
  const sortedTx = useMemo(() => [...txRows].sort((a, b) => b.id - a.id), [txRows]);

  const pendingTx = useMemo(
    () => txRows.filter((t) => String(t.payment_status).toLowerCase() === "pending"),
    [txRows],
  );

  const txInCount = useMemo(
    () => txRows.filter((t) => String(t.transaction_type).toLowerCase() === "in").length,
    [txRows],
  );
  const txOutCount = useMemo(
    () => txRows.filter((t) => String(t.transaction_type).toLowerCase() === "out").length,
    [txRows],
  );

  const activeOrders = useMemo(
    () => orderRows.filter((o) => ["pending", "accepted", "running"].includes(String(o.status).toLowerCase())),
    [orderRows],
  );

  const revenueLast7Days = useMemo(() => {
    const dayMs = 24 * 60 * 60 * 1000;
    const now = new Date();
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now.getTime() - (6 - index) * dayMs);
      const key = date.toISOString().slice(0, 10);
      return {
        key,
        dayLabel: date.toLocaleDateString("en-US", { weekday: "short" }),
        revenue: 0,
      };
    });
    const indexByDay = new Map(days.map((item, index) => [item.key, index]));
    for (const order of orderRows) {
      if (!order.created_at) continue;
      const dayKey = new Date(order.created_at).toISOString().slice(0, 10);
      const dayIndex = indexByDay.get(dayKey);
      if (dayIndex == null) continue;
      days[dayIndex].revenue += Number(order.total ?? 0);
    }
    return days;
  }, [orderRows]);

  const paymentStatusPie = useMemo(() => {
    const bucket: Record<string, number> = {};
    for (const t of txRows) {
      const key = String(t.payment_status ?? "unknown").toLowerCase();
      bucket[key] = (bucket[key] ?? 0) + 1;
    }
    return Object.entries(bucket)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({ name, value }));
  }, [txRows]);

  const txFlowBars = useMemo(
    () => [
      { name: "In", count: txInCount },
      { name: "Out", count: txOutCount },
    ],
    [txInCount, txOutCount],
  );

  const membershipsAtRestaurant = useMemo(() => {
    const list = user?.staff_memberships ?? [];
    if (restaurantId == null) return list.filter((m) => !m.is_suspend);
    return list.filter((m) => !m.is_suspend && m.restaurant === restaurantId);
  }, [user?.staff_memberships, restaurantId]);

  const moduleVolumeBars = useMemo(
    () => [
      { name: "Alerts", count: openCounterAlertCount },
      { name: "Orders", count: orderRows.length },
      { name: "Ledger", count: ledgerRows.length },
      { name: "Txn", count: txRows.length },
      { name: "Profile", count: membershipsAtRestaurant.length },
    ],
    [openCounterAlertCount, orderRows.length, ledgerRows.length, txRows.length, membershipsAtRestaurant.length],
  );

  const revenue7dTotal = useMemo(() => revenueLast7Days.reduce((s, d) => s + d.revenue, 0), [revenueLast7Days]);

  const statLoading = loadingOrders || loadingPendingPayments || loadingLedger || loadingTx;

  const moduleCards = [
    {
      title: "Dashboard",
      desc: "Checkout overview",
      to: STAFF_PATH.cashierDashboard,
      icon: LayoutDashboard,
      stat: `${openCounterAlertCount} pending payment${openCounterAlertCount === 1 ? "" : "s"}`,
      stripe: "from-slate-400 to-slate-600",
      iconBg: "bg-slate-100 text-slate-700 ring-slate-200/80",
    },
    {
      title: "Payment alerts",
      desc: "Open bills and settled rows at the counter",
      to: STAFF_PATH.paymentAlerts,
      icon: AlertTriangle,
      stat: `${openCounterAlertCount} need collection`,
      stripe: "from-amber-400 to-amber-600",
      iconBg: "bg-amber-50 text-amber-900 ring-amber-200/80",
    },
    {
      title: "Ledger",
      desc: "Your entries",
      to: STAFF_PATH.ledger,
      icon: BookOpen,
      stat: `${ledgerRows.length} lines`,
      stripe: "from-teal-500 to-teal-700",
      iconBg: "bg-teal-50 text-teal-900 ring-teal-200/70",
    },
    {
      title: "Transactions",
      desc: "Cash & digital flow",
      to: STAFF_PATH.transactions,
      icon: ArrowLeftRight,
      stat: `${pendingTx.length} pending`,
      stripe: "from-blue-500 to-indigo-600",
      iconBg: "bg-blue-50 text-blue-800 ring-blue-200/70",
    },
    {
      title: "Menu QR",
      desc: "Share customer menu QR",
      to: STAFF_PATH.menuQr,
      icon: QrCode,
      stat: "Print-ready",
      stripe: "from-emerald-400 to-emerald-700",
      iconBg: "bg-emerald-50 text-emerald-800 ring-emerald-200/70",
    },
    {
      title: "Profile",
      desc: "Account & memberships",
      to: STAFF_PATH.profile,
      icon: User,
      stat: `${membershipsAtRestaurant.length} location${membershipsAtRestaurant.length === 1 ? "" : "s"}`,
      stripe: "from-violet-400 to-violet-700",
      iconBg: "bg-violet-50 text-violet-900 ring-violet-200/70",
    },
  ] as const;

  const orderTypeFills = ["var(--chart-1)", "var(--chart-4)"];
  const moduleBarFills = [
    "var(--chart-4)",
    "var(--chart-1)",
    "var(--chart-5)",
    "var(--chart-3)",
    "var(--chart-6)",
  ];

  function alertCustomerLabel(o: ProximityAlertOrder): string {
    const name = (o.customer_name ?? "").trim() || (o.guest_customer_name ?? "").trim();
    return name || "—";
  }

  return (
    <div className="space-y-10 pb-2">
      <div className="relative overflow-hidden rounded-2xl border border-border/90 bg-gradient-to-br from-amber-50/95 via-card to-muted/40 p-5 shadow-md ring-1 ring-amber-500/10 sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-20 size-52 rounded-full bg-amber-400/[0.14] blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/4 size-36 rounded-full bg-primary/[0.06] blur-2xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-amber-600 text-white shadow-lg shadow-amber-600/25">
              <Banknote className="size-6" strokeWidth={1.75} aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Checkout desk</h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-text-secondary">
                Collections, pending payments, and ledger activity — aligned with every screen in your cashier sidebar.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 self-start sm:flex-row sm:items-center sm:gap-3 lg:self-center">
            {statLoading ? (
              <div className="flex items-center gap-2 rounded-full border border-border/80 bg-card/90 px-4 py-2 text-xs font-semibold text-text-secondary shadow-sm backdrop-blur-sm">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500/45" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-600" />
                </span>
                Syncing data…
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-950 shadow-sm">
                <span className="size-2 rounded-full bg-amber-600 shadow-[0_0_8px_rgba(217,119,6,0.45)]" />
                Live snapshot
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 gap-2 rounded-xl border-primary/25 bg-card px-4 shadow-sm hover:bg-primary/5"
              disabled={restaurantId == null}
              onClick={() => setRawMaterialScanOpen(true)}
              aria-label="Open camera to scan and add raw materials"
            >
              <Camera className="size-4 shrink-0 text-primary" aria-hidden />
              <span className="font-semibold">Raw stock scan</span>
            </Button>
          </div>
        </div>
      </div>

      <section className="space-y-5">
        <SectionHeader
          eyebrow="Metrics"
          title="Desk at a glance"
          description="Alerts, open payments, pipeline orders, and the ledger lines tied to your cashier access."
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6 xl:gap-4">
          <StatFrame accentClass="from-amber-500/55 via-amber-400/18 to-transparent">
            <StatCard
              className="h-full rounded-[0.9375rem] border-0 shadow-none"
              icon={AlertTriangle}
              label="Pending payments"
              value={statLoading ? "…" : String(openCounterAlertCount)}
            />
          </StatFrame>
          <StatFrame accentClass="from-rose-500/45 via-rose-400/12 to-transparent">
            <StatCard
              className="h-full rounded-[0.9375rem] border-0 shadow-none"
              icon={CreditCard}
              label="Orders on file"
              value={statLoading ? "…" : String(orderRows.length)}
            />
          </StatFrame>
          <StatFrame accentClass="from-primary/55 via-primary/20 to-transparent">
            <StatCard
              className="h-full rounded-[0.9375rem] border-0 shadow-none"
              icon={LayoutDashboard}
              label="Active orders"
              value={statLoading ? "…" : String(activeOrders.length)}
            />
          </StatFrame>
          <StatFrame accentClass="from-blue-600/40 via-blue-500/12 to-transparent">
            <StatCard
              className="h-full rounded-[0.9375rem] border-0 shadow-none"
              icon={ArrowLeftRight}
              label="Pending txns"
              value={statLoading ? "…" : String(pendingTx.length)}
            />
          </StatFrame>
          <StatFrame accentClass="from-teal-500/45 via-teal-400/12 to-transparent">
            <StatCard
              className="h-full rounded-[0.9375rem] border-0 shadow-none"
              icon={BookOpen}
              label="Ledger lines"
              value={statLoading ? "…" : String(ledgerRows.length)}
            />
          </StatFrame>
          <StatFrame accentClass="from-emerald-500/45 via-emerald-400/12 to-transparent">
            <StatCard
              className="h-full rounded-[0.9375rem] border-0 shadow-none"
              icon={TrendingUp}
              label="7-day order total"
              value={statLoading ? "…" : formatInr(revenue7dTotal)}
            />
          </StatFrame>
        </div>
      </section>

      <section className="space-y-5">
        <SectionHeader
          eyebrow="Navigate"
          title="Workspace"
          description="Each card mirrors a sidebar destination — open alerts first when guests are approaching unpaid."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {moduleCards.map((m) => (
            <Link
              key={m.title}
              to={m.to}
              className="group relative overflow-hidden rounded-2xl border border-border/90 bg-gradient-to-br from-card via-card to-muted/25 p-5 shadow-sm ring-1 ring-black/[0.03] transition-all duration-300 hover:-translate-y-0.5 hover:border-amber-500/25 hover:shadow-lg"
            >
              <div
                className={cn(
                  "absolute left-0 top-0 h-full w-1 bg-gradient-to-b opacity-90 transition-opacity group-hover:opacity-100",
                  m.stripe,
                )}
              />
              <div className="relative flex items-start gap-4 pl-2">
                <div
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 shadow-inner transition-transform duration-300 group-hover:scale-105",
                    m.iconBg,
                  )}
                >
                  <m.icon className="size-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="font-display text-base font-bold tracking-tight text-foreground transition-colors group-hover:text-amber-800">
                    {m.title}
                  </p>
                  <p className="mt-1 text-sm text-text-muted">{m.desc}</p>
                  <p className="mt-3 inline-flex items-center rounded-lg bg-muted/60 px-2.5 py-1 text-xs font-semibold text-text-secondary ring-1 ring-border/60">
                    {m.stat}
                  </p>
                </div>
                <ChevronRight
                  className="size-5 shrink-0 text-text-muted transition-all group-hover:translate-x-0.5 group-hover:text-amber-700"
                  aria-hidden
                />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-5">
        <SectionHeader
          eyebrow="Analytics"
          title="Charts"
          description="Order value cadence, how payments are clearing, money in vs out, and volume across each cashier module."
        />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Card className="overflow-hidden rounded-2xl border-border/90 shadow-md ring-1 ring-black/[0.02] lg:col-span-2">
            <CardHeader className="space-y-1 border-b border-border/60 bg-muted/20 px-5 pb-4 pt-5">
              <CardTitle className="font-display text-base">Order value trend</CardTitle>
              <CardDescription>Order totals by day — last 7 days from synced orders.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              <div className="rounded-xl border border-border/70 bg-muted/15 p-2 sm:p-3">
                <ResponsiveContainer width="100%" height={252}>
                  <ComposedChart data={revenueLast7Days}>
                    <defs>
                      <linearGradient id="cashierRevenueArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_ACCENT} stopOpacity={0.22} />
                        <stop offset="88%" stopColor={CHART_ACCENT} stopOpacity={0.02} />
                        <stop offset="100%" stopColor={CHART_ACCENT} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="dayLabel" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                      width={52}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip {...chartTooltip} formatter={(value: number | string) => [formatInr(Number(value)), "Total"]} />
                    <Area type="monotone" dataKey="revenue" stroke={false} fill="url(#cashierRevenueArea)" />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke={CHART_ACCENT}
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: "var(--card)", stroke: CHART_ACCENT, strokeWidth: 2 }}
                      activeDot={{ r: 6 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-2xl border-border/90 shadow-md ring-1 ring-black/[0.02]">
            <CardHeader className="space-y-1 border-b border-border/60 bg-muted/20 px-5 pb-4 pt-5">
              <CardTitle className="font-display text-base">Txn payment status</CardTitle>
              <CardDescription>Share of loaded transactions by payment state.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col px-5 pb-5 pt-4">
              {paymentStatusPie.length === 0 ? (
                <p className="py-12 text-center text-sm text-text-muted">No transactions to chart yet.</p>
              ) : (
                <>
                  <div className="rounded-xl border border-border/70 bg-muted/15 p-2">
                    <ResponsiveContainer width="100%" height={208}>
                      <PieChart>
                        <Pie
                          data={paymentStatusPie}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={48}
                          outerRadius={76}
                          paddingAngle={2}
                          stroke="var(--card)"
                          strokeWidth={2}
                        >
                          {paymentStatusPie.map((entry) => (
                            <Cell
                              key={entry.name}
                              fill={PAYMENT_STATUS_COLORS[entry.name] ?? PAYMENT_STATUS_COLORS.other}
                            />
                          ))}
                        </Pie>
                        <Tooltip {...chartTooltip} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {paymentStatusPie.map((item) => (
                      <span
                        key={item.name}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-2.5 py-1 text-[11px] font-medium capitalize text-text-secondary shadow-sm"
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full shadow-sm"
                          style={{
                            backgroundColor: PAYMENT_STATUS_COLORS[item.name] ?? PAYMENT_STATUS_COLORS.other,
                          }}
                        />
                        {item.name.replaceAll("_", " ")} ({item.value})
                      </span>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-2xl border-border/90 shadow-md ring-1 ring-black/[0.02] lg:col-span-2">
            <CardHeader className="space-y-1 border-b border-border/60 bg-muted/20 px-5 pb-4 pt-5">
              <CardTitle className="font-display text-base">Money in vs out</CardTitle>
              <CardDescription>Transaction rows classified as in-flow or out-flow.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              <div className="rounded-xl border border-border/70 bg-muted/15 p-2 sm:p-3">
                <ResponsiveContainer width="100%" height={228}>
                  <BarChart data={txFlowBars}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                      width={36}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip {...chartTooltip} />
                    <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                      {txFlowBars.map((_, i) => (
                        <Cell key={`flow-${i}`} fill={orderTypeFills[i % orderTypeFills.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-2xl border-border/90 shadow-md ring-1 ring-black/[0.02]">
            <CardHeader className="space-y-1 border-b border-border/60 bg-muted/20 px-5 pb-4 pt-5">
              <CardTitle className="font-display text-base">Sidebar modules</CardTitle>
              <CardDescription>Record counts across alerts, orders, ledger, payments, and profile.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              <div className="rounded-xl border border-border/70 bg-muted/15 p-2 sm:p-3">
                <ResponsiveContainer width="100%" height={228}>
                  <BarChart data={moduleVolumeBars} layout="vertical" margin={{ left: 4, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={76}
                      tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip {...chartTooltip} />
                    <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                      {moduleVolumeBars.map((_, i) => (
                        <Cell key={`mod-${i}`} fill={moduleBarFills[i % moduleBarFills.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-5">
        <SectionHeader
          eyebrow="Lists"
          title="Recent activity"
          description="Five-row previews with See All — jump to the dedicated page for the full queue."
        />
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <TableShell
            title="Payment alerts"
            seeAllTo={STAFF_PATH.paymentAlerts}
            totalCount={sortedAlerts.length}
            rowCount={Math.min(PREVIEW_ROWS, sortedAlerts.length)}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/80 bg-muted/40 text-left text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2.5 sm:px-5">Order</th>
                  <th className="px-4 py-2.5 sm:px-5">Customer</th>
                  <th className="px-4 py-2.5 sm:px-5">Total</th>
                </tr>
              </thead>
              <tbody>
                {sortedAlerts.slice(0, PREVIEW_ROWS).map((o) => (
                  <tr
                    key={o.id}
                    className="border-b border-border/60 transition-colors odd:bg-muted/20 last:border-0 hover:bg-primary/[0.04]"
                  >
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground sm:px-5">{o.order_id}</td>
                    <td className="max-w-[120px] truncate px-4 py-3 text-text-secondary sm:px-5" title={alertCustomerLabel(o)}>
                      {alertCustomerLabel(o)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-text-secondary sm:px-5">{formatInr(Number(o.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>

          <TableShell
            title="Unpaid orders"
            totalCount={sortedUnpaidOrders.length}
            rowCount={Math.min(PREVIEW_ROWS, sortedUnpaidOrders.length)}
            onSeeAll={() => setUnpaidOrdersDialogOpen(true)}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/80 bg-muted/40 text-left text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2.5 sm:px-5">Order</th>
                  <th className="px-4 py-2.5 sm:px-5">Total</th>
                  <th className="px-4 py-2.5 sm:px-5">Payment</th>
                </tr>
              </thead>
              <tbody>
                {sortedUnpaidOrders.slice(0, PREVIEW_ROWS).map((o) => (
                  <tr
                    key={o.id}
                    className="border-b border-border/60 transition-colors odd:bg-muted/20 last:border-0 hover:bg-primary/[0.04]"
                  >
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground sm:px-5">{o.order_id}</td>
                    <td className="px-4 py-3 text-text-secondary sm:px-5">
                      {o.total != null ? formatInr(Number(o.total)) : "—"}
                    </td>
                    <td className="px-4 py-3 sm:px-5">
                      <StatusBadge status={o.payment_status ?? "—"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>

          <TableShell
            title="Ledger"
            seeAllTo={STAFF_PATH.ledger}
            totalCount={sortedLedger.length}
            rowCount={Math.min(PREVIEW_ROWS, sortedLedger.length)}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/80 bg-muted/40 text-left text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2.5 sm:px-5">Particular</th>
                  <th className="px-4 py-2.5 sm:px-5">Amount</th>
                  <th className="px-4 py-2.5 sm:px-5">Type</th>
                </tr>
              </thead>
              <tbody>
                {sortedLedger.slice(0, PREVIEW_ROWS).map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border/60 transition-colors odd:bg-muted/20 last:border-0 hover:bg-primary/[0.04]"
                  >
                    <td className="max-w-[140px] truncate px-4 py-3 text-foreground sm:px-5" title={r.particular}>
                      {r.particular}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-text-secondary sm:px-5">{formatInr(Number(r.amount))}</td>
                    <td className="px-4 py-3 sm:px-5">
                      <StatusBadge status={r.type} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>

          <TableShell
            title="Transactions"
            seeAllTo={STAFF_PATH.transactions}
            totalCount={sortedTx.length}
            rowCount={Math.min(PREVIEW_ROWS, sortedTx.length)}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/80 bg-muted/40 text-left text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2.5 sm:px-5">Amount</th>
                  <th className="px-4 py-2.5 sm:px-5">Payment</th>
                  <th className="px-4 py-2.5 sm:px-5">Flow</th>
                  <th className="px-4 py-2.5 sm:px-5">Category</th>
                </tr>
              </thead>
              <tbody>
                {sortedTx.slice(0, PREVIEW_ROWS).map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-border/60 transition-colors odd:bg-muted/20 last:border-0 hover:bg-primary/[0.04]"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-foreground sm:px-5">{formatInr(Number(t.amount))}</td>
                    <td className="px-4 py-3 sm:px-5">
                      <StatusBadge status={t.payment_status} />
                    </td>
                    <td className="px-4 py-3 sm:px-5">
                      <StatusBadge status={t.transaction_type} />
                    </td>
                    <td className="px-4 py-3 sm:px-5">
                      <StatusBadge status={t.category} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        </div>
      </section>

      {restaurantId != null ? (
        <CashierScanRawMaterialDialog
          open={rawMaterialScanOpen}
          onOpenChange={setRawMaterialScanOpen}
          restaurantId={restaurantId}
        />
      ) : null}

      <Dialog open={unpaidOrdersDialogOpen} onOpenChange={setUnpaidOrdersDialogOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="space-y-1 border-b border-border/80 bg-muted/25 px-6 py-5 pr-14 text-left sm:text-left">
            <DialogTitle className="font-display text-xl">All unpaid orders</DialogTitle>
            <DialogDescription>
              Orders for this restaurant with payment still pending ({sortedUnpaidOrders.length} total). Same list as
              Payment alerts, including proximity-flagged rows when GPS is in range.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4 sm:px-6">
            {sortedUnpaidOrders.map((o, idx) => (
              <div
                key={o.id}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-xl border border-border/80 px-4 py-3 shadow-sm",
                  idx % 2 === 1 ? "bg-muted/25" : "bg-card",
                )}
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold text-foreground">{o.order_id}</p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {o.total != null ? formatInr(Number(o.total)) : "—"}
                    {o.created_at ? ` · ${new Date(o.created_at).toLocaleString()}` : ""}
                  </p>
                </div>
                <StatusBadge status={o.payment_status ?? "—"} />
              </div>
            ))}
            {sortedUnpaidOrders.length === 0 ? (
              <p className="py-8 text-center text-sm text-text-muted">No unpaid orders in the synced list.</p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
