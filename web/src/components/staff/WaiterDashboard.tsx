import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  BookOpen,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  Package,
  QrCode,
  ShoppingCart,
  Sparkles,
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
import { OrderTableVisual } from "@/components/shared/OrderTableVisual";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { useLedgers, useOrders, useTransactions } from "@/hooks/use-rest-api";
import { STAFF_PATH } from "@/lib/portal-routes";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { cn } from "@/lib/utils";

const PREVIEW_ROWS = 5;
const CHART_PRIMARY = "#F83232";

interface OrderRow {
  id: number;
  order_id: string;
  status: string;
  total?: string | number;
  created_at?: string | null;
  order_type?: string | null;
}

interface PickupOrderRow {
  id: number;
  order_id: string;
  status: string;
  table: number | null;
  table_name?: string | null;
  table_image?: string | null;
  people_for: number;
  created_at?: string | null;
  updated_at?: string | null;
  waiting_pickup_at?: string | null;
}

function waitingSinceMsPickup(order: PickupOrderRow): number | null {
  const raw = order.waiting_pickup_at ?? order.updated_at ?? order.created_at;
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

function sortPickupOldestFirst(a: PickupOrderRow, b: PickupOrderRow): number {
  const fa = waitingSinceMsPickup(a) ?? Number.MAX_SAFE_INTEGER;
  const fb = waitingSinceMsPickup(b) ?? Number.MAX_SAFE_INTEGER;
  if (fa !== fb) return fa - fb;
  return a.id - b.id;
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
      <div className="flex items-center justify-between gap-3 border-b border-border/80 bg-gradient-to-r from-muted/40 via-transparent to-primary-50/20 px-4 py-3.5 sm:px-5">
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

export function WaiterDashboard() {
  const { user } = useAuth();
  const { restaurantId } = useRestaurantScope();
  const partyId = user != null ? String(user.id) : null;

  const { data: orders = [], isLoading: loadingOrders } = useOrders(restaurantId);
  const { data: pickupOrders = [], isLoading: loadingPickup } = useOrders(restaurantId, {
    forWaiterPickupQueue: true,
    refetchInterval: 12_000,
  });
  const { data: ledger = [], isLoading: loadingLedger } = useLedgers(restaurantId, "staff", partyId);
  const { data: transactions = [], isLoading: loadingTx } = useTransactions(restaurantId);

  const [ordersDialogOpen, setOrdersDialogOpen] = useState(false);

  const orderRows = orders as OrderRow[];
  const pickupRows = pickupOrders as PickupOrderRow[];
  const ledgerRows = ledger as LedgerRow[];
  const txRows = transactions as TxRow[];

  const sortedOrders = useMemo(() => {
    return [...orderRows].sort((a, b) => {
      const ta = a.created_at ? Date.parse(String(a.created_at)) : 0;
      const tb = b.created_at ? Date.parse(String(b.created_at)) : 0;
      if (tb !== ta) return tb - ta;
      return b.id - a.id;
    });
  }, [orderRows]);

  const sortedLedger = useMemo(() => {
    return [...ledgerRows].sort((a, b) => b.id - a.id);
  }, [ledgerRows]);

  const sortedTx = useMemo(() => {
    return [...txRows].sort((a, b) => b.id - a.id);
  }, [txRows]);

  const sortedPickupPreview = useMemo(() => {
    return [...pickupRows].sort(sortPickupOldestFirst).slice(0, PREVIEW_ROWS);
  }, [pickupRows]);

  const activeOrders = useMemo(
    () => orderRows.filter((o) => ["pending", "accepted", "running"].includes(String(o.status).toLowerCase())),
    [orderRows],
  );

  const pendingTx = useMemo(
    () => txRows.filter((t) => String(t.payment_status).toLowerCase() === "pending"),
    [txRows],
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

  const orderStatusPie = useMemo(() => {
    const bucket: Record<string, number> = {
      pending: 0,
      accepted: 0,
      running: 0,
      ready: 0,
      waiting_pickup: 0,
      delivered: 0,
      rejected: 0,
      other: 0,
    };
    for (const order of orderRows) {
      const key = String(order.status ?? "").toLowerCase();
      if (key in bucket) bucket[key] += 1;
      else bucket.other += 1;
    }
    return Object.entries(bucket)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({ name, value }));
  }, [orderRows]);

  const statusColors: Record<string, string> = {
    pending: "#ef4444",
    accepted: "#fca5a5",
    running: "#2563eb",
    ready: "#16a34a",
    waiting_pickup: "#0d9488",
    delivered: "#64748b",
    rejected: "#d97706",
    other: "#a855f7",
  };

  const orderTypeBars = useMemo(() => {
    const bucket: Record<string, number> = { table: 0, packing: 0, delivery: 0 };
    for (const order of orderRows) {
      const key = String(order.order_type ?? "").toLowerCase();
      if (key in bucket) bucket[key] += 1;
    }
    return Object.entries(bucket).map(([name, count]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      count,
    }));
  }, [orderRows]);

  const membershipsAtRestaurant = useMemo(() => {
    const list = user?.staff_memberships ?? [];
    if (restaurantId == null) return list.filter((m) => !m.is_suspend);
    return list.filter((m) => !m.is_suspend && m.restaurant === restaurantId);
  }, [user?.staff_memberships, restaurantId]);

  const moduleVolumeBars = useMemo(
    () => [
      { name: "Orders", count: orderRows.length },
      { name: "Pickup", count: pickupRows.length },
      { name: "Ledger", count: ledgerRows.length },
      { name: "Txn", count: txRows.length },
      { name: "Profile", count: membershipsAtRestaurant.length },
    ],
    [orderRows.length, pickupRows.length, ledgerRows.length, txRows.length, membershipsAtRestaurant.length],
  );

  const revenue7dTotal = useMemo(() => revenueLast7Days.reduce((s, d) => s + d.revenue, 0), [revenueLast7Days]);

  const statLoading = loadingOrders || loadingPickup || loadingLedger || loadingTx;

  const moduleCards = [
    {
      title: "Dashboard",
      desc: "Overview & analytics",
      to: STAFF_PATH.home,
      icon: LayoutDashboard,
      stat: `${orderRows.length} orders loaded`,
      stripe: "from-slate-400 to-slate-600",
      iconBg: "bg-slate-100 text-slate-700 ring-slate-200/80",
    },
    {
      title: "POS",
      desc: "Take orders & payments",
      to: STAFF_PATH.pos,
      icon: ShoppingCart,
      stat: `${activeOrders.length} active`,
      stripe: "from-primary to-primary-600",
      iconBg: "bg-primary-50 text-primary ring-primary/15",
    },
    {
      title: "Waiting pickup",
      desc: "Hand off when guests arrive",
      to: STAFF_PATH.waitingPickup,
      icon: Package,
      stat: `${pickupRows.length} in queue`,
      stripe: "from-teal-400 to-teal-600",
      iconBg: "bg-teal-50 text-teal-800 ring-teal-200/70",
    },
    {
      title: "Ledger",
      desc: "Your entries",
      to: STAFF_PATH.ledger,
      icon: BookOpen,
      stat: `${ledgerRows.length} lines`,
      stripe: "from-amber-400 to-amber-600",
      iconBg: "bg-amber-50 text-amber-900 ring-amber-200/80",
    },
    {
      title: "Transactions",
      desc: "In, out & pending",
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

  const orderTypeFills = ["var(--chart-1)", "var(--chart-3)", "var(--chart-4)"];
  const moduleBarFills = [
    "var(--chart-1)",
    "var(--chart-4)",
    "var(--chart-5)",
    "var(--chart-3)",
    "var(--chart-6)",
  ];

  return (
    <div className="space-y-10 pb-2">
      <div className="relative overflow-hidden rounded-2xl border border-border/90 bg-gradient-to-br from-primary-50/95 via-card to-muted/40 p-5 shadow-md ring-1 ring-primary/5 sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-24 size-56 rounded-full bg-primary/[0.09] blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 size-40 rounded-full bg-teal-400/10 blur-2xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
              <Sparkles className="size-6" strokeWidth={1.75} aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Shift overview</h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-text-secondary">
                One place to read the floor: sales trend, order mix, pickup pressure, and quick jumps to every item in
                your sidebar.
              </p>
            </div>
          </div>
          {statLoading ? (
            <div className="flex shrink-0 items-center gap-2 self-start rounded-full border border-border/80 bg-card/90 px-4 py-2 text-xs font-semibold text-text-secondary shadow-sm backdrop-blur-sm lg:self-center">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/50" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
              </span>
              Syncing data…
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-2 self-start rounded-full border border-success/25 bg-success-bg px-4 py-2 text-xs font-bold text-success shadow-sm lg:self-center">
              <span className="size-2 rounded-full bg-success shadow-[0_0_8px_rgba(22,163,74,0.5)]" />
              Live snapshot
            </div>
          )}
        </div>
      </div>

      <section className="space-y-5">
        <SectionHeader
          eyebrow="Metrics"
          title="Today at a glance"
          description="Counts and totals from the orders, pickup queue, ledger, and payments you can access in this portal."
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6 xl:gap-4">
          <StatFrame accentClass="from-primary/55 via-primary/20 to-transparent">
            <StatCard
              className="h-full rounded-[0.9375rem] border-0 shadow-none"
              icon={ShoppingCart}
              label="Active orders"
              value={statLoading ? "…" : String(activeOrders.length)}
            />
          </StatFrame>
          <StatFrame accentClass="from-teal-500/50 via-teal-400/15 to-transparent">
            <StatCard
              className="h-full rounded-[0.9375rem] border-0 shadow-none"
              icon={Package}
              label="Waiting pickup"
              value={statLoading ? "…" : String(pickupRows.length)}
            />
          </StatFrame>
          <StatFrame accentClass="from-amber-500/45 via-amber-400/12 to-transparent">
            <StatCard
              className="h-full rounded-[0.9375rem] border-0 shadow-none"
              icon={BookOpen}
              label="Ledger lines"
              value={statLoading ? "…" : String(ledgerRows.length)}
            />
          </StatFrame>
          <StatFrame accentClass="from-blue-600/40 via-blue-500/12 to-transparent">
            <StatCard
              className="h-full rounded-[0.9375rem] border-0 shadow-none"
              icon={ArrowLeftRight}
              label="Transactions"
              value={statLoading ? "…" : String(txRows.length)}
            />
          </StatFrame>
          <StatFrame accentClass="from-violet-500/45 via-violet-400/12 to-transparent">
            <StatCard
              className="h-full rounded-[0.9375rem] border-0 shadow-none"
              icon={CreditCard}
              label="Pending payments"
              value={statLoading ? "…" : String(pendingTx.length)}
            />
          </StatFrame>
          <StatFrame accentClass="from-emerald-500/45 via-emerald-400/12 to-transparent">
            <StatCard
              className="h-full rounded-[0.9375rem] border-0 shadow-none"
              icon={TrendingUp}
              label="7-day sales (loaded)"
              value={statLoading ? "…" : formatInr(revenue7dTotal)}
            />
          </StatFrame>
        </div>
      </section>

      <section className="space-y-5">
        <SectionHeader
          eyebrow="Navigate"
          title="Workspace"
          description="Each card mirrors a sidebar destination — tap through to work the queue."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {moduleCards.map((m) => (
            <Link
              key={m.title}
              to={m.to}
              className="group relative overflow-hidden rounded-2xl border border-border/90 bg-gradient-to-br from-card via-card to-muted/25 p-5 shadow-sm ring-1 ring-black/[0.03] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg"
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
                  <p className="font-display text-base font-bold tracking-tight text-foreground transition-colors group-hover:text-primary">
                    {m.title}
                  </p>
                  <p className="mt-1 text-sm text-text-muted">{m.desc}</p>
                  <p className="mt-3 inline-flex items-center rounded-lg bg-muted/60 px-2.5 py-1 text-xs font-semibold text-text-secondary ring-1 ring-border/60">
                    {m.stat}
                  </p>
                </div>
                <ChevronRight
                  className="size-5 shrink-0 text-text-muted transition-all group-hover:translate-x-0.5 group-hover:text-primary"
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
          description="Visual summaries of revenue, kitchen status, service type, and how busy each area of the app is."
        />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Card className="overflow-hidden rounded-2xl border-border/90 shadow-md ring-1 ring-black/[0.02] lg:col-span-2">
            <CardHeader className="space-y-1 border-b border-border/60 bg-muted/20 px-5 pb-4 pt-5">
              <CardTitle className="font-display text-base">Sales trend</CardTitle>
              <CardDescription>Order totals by day — last 7 days from your loaded orders.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              <div className="rounded-xl border border-border/70 bg-muted/15 p-2 sm:p-3">
                <ResponsiveContainer width="100%" height={252}>
                  <ComposedChart data={revenueLast7Days}>
                    <defs>
                      <linearGradient id="waiterRevenueArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_PRIMARY} stopOpacity={0.22} />
                        <stop offset="88%" stopColor={CHART_PRIMARY} stopOpacity={0.02} />
                        <stop offset="100%" stopColor={CHART_PRIMARY} stopOpacity={0} />
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
                    <Tooltip
                      {...chartTooltip}
                      formatter={(value: number | string) => [formatInr(Number(value)), "Total"]}
                    />
                    <Area type="monotone" dataKey="revenue" stroke={false} fill="url(#waiterRevenueArea)" />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke={CHART_PRIMARY}
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: "var(--card)", stroke: CHART_PRIMARY, strokeWidth: 2 }}
                      activeDot={{ r: 6 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-2xl border-border/90 shadow-md ring-1 ring-black/[0.02]">
            <CardHeader className="space-y-1 border-b border-border/60 bg-muted/20 px-5 pb-4 pt-5">
              <CardTitle className="font-display text-base">Order status</CardTitle>
              <CardDescription>Share of loaded orders by kitchen status.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col px-5 pb-5 pt-4">
              {orderStatusPie.length === 0 ? (
                <p className="py-12 text-center text-sm text-text-muted">No orders to chart yet.</p>
              ) : (
                <>
                  <div className="rounded-xl border border-border/70 bg-muted/15 p-2">
                    <ResponsiveContainer width="100%" height={208}>
                      <PieChart>
                        <Pie
                          data={orderStatusPie}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={48}
                          outerRadius={76}
                          paddingAngle={2}
                          stroke="var(--card)"
                          strokeWidth={2}
                        >
                          {orderStatusPie.map((entry) => (
                            <Cell key={entry.name} fill={statusColors[entry.name] ?? "#94a3b8"} />
                          ))}
                        </Pie>
                        <Tooltip {...chartTooltip} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {orderStatusPie.map((item) => (
                      <span
                        key={item.name}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-2.5 py-1 text-[11px] font-medium capitalize text-text-secondary shadow-sm"
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full shadow-sm"
                          style={{ backgroundColor: statusColors[item.name] ?? "#94a3b8" }}
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
              <CardTitle className="font-display text-base">Orders by type</CardTitle>
              <CardDescription>Table, packing, and delivery mix.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              <div className="rounded-xl border border-border/70 bg-muted/15 p-2 sm:p-3">
                <ResponsiveContainer width="100%" height={228}>
                  <BarChart data={orderTypeBars}>
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
                      {orderTypeBars.map((_, i) => (
                        <Cell key={`cell-${i}`} fill={orderTypeFills[i % orderTypeFills.length]} />
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
              <CardDescription>Record counts across each menu area.</CardDescription>
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
          description="Compact previews — open the full screen when you need every row."
        />
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <TableShell
            title="Orders (POS)"
            totalCount={sortedOrders.length}
            rowCount={Math.min(PREVIEW_ROWS, sortedOrders.length)}
            onSeeAll={() => setOrdersDialogOpen(true)}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/80 bg-muted/40 text-left text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2.5 sm:px-5">Order</th>
                  <th className="px-4 py-2.5 sm:px-5">Total</th>
                  <th className="px-4 py-2.5 sm:px-5">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedOrders.slice(0, PREVIEW_ROWS).map((o) => (
                  <tr
                    key={o.id}
                    className="border-b border-border/60 transition-colors odd:bg-muted/20 last:border-0 hover:bg-primary/[0.04]"
                  >
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground sm:px-5">{o.order_id}</td>
                    <td className="px-4 py-3 text-text-secondary sm:px-5">
                      {o.total != null ? formatInr(Number(o.total)) : "—"}
                    </td>
                    <td className="px-4 py-3 sm:px-5">
                      <StatusBadge status={o.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>

          <TableShell
            title="Waiting pickup"
            seeAllTo={STAFF_PATH.waitingPickup}
            totalCount={pickupRows.length}
            rowCount={sortedPickupPreview.length}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/80 bg-muted/40 text-left text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2.5 sm:px-5">Order</th>
                  <th className="px-4 py-2.5 sm:px-5">Table</th>
                  <th className="px-4 py-2.5 sm:px-5">Guests</th>
                </tr>
              </thead>
              <tbody>
                {sortedPickupPreview.map((o) => (
                  <tr
                    key={o.id}
                    className="border-b border-border/60 transition-colors odd:bg-muted/20 last:border-0 hover:bg-primary/[0.04]"
                  >
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground sm:px-5">{o.order_id}</td>
                    <td className="px-4 py-3 text-text-secondary sm:px-5">
                      <OrderTableVisual
                        tableName={o.table_name}
                        tableId={o.table}
                        tableImage={o.table_image}
                        compact
                      />
                    </td>
                    <td className="px-4 py-3 text-text-secondary sm:px-5">{o.people_for}</td>
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
                    <td className="whitespace-nowrap px-4 py-3 text-text-secondary sm:px-5">
                      {formatInr(Number(r.amount))}
                    </td>
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

      <Dialog open={ordersDialogOpen} onOpenChange={setOrdersDialogOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="space-y-1 border-b border-border/80 bg-muted/25 px-6 py-5 pr-14 text-left sm:text-left">
            <DialogTitle className="font-display text-xl">All orders</DialogTitle>
            <DialogDescription>
              Every order currently loaded for this restaurant ({sortedOrders.length} total).
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4 sm:px-6">
            {sortedOrders.map((o, idx) => (
              <div
                key={o.id}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-xl border border-border/80 px-4 py-3 shadow-sm",
                  idx % 2 === 1 ? "bg-muted/25" : "bg-card",
                )}
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold text-foreground">{o.order_id}</p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {o.total != null ? formatInr(Number(o.total)) : "—"}
                    {o.created_at ? ` · ${new Date(o.created_at).toLocaleString()}` : ""}
                  </p>
                </div>
                <StatusBadge status={o.status} />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
