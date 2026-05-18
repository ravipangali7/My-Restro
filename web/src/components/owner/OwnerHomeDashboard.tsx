import { StatCard, StatCardsGrid } from "@/components/shared/StatCard";
import {
  ChartCard,
  PORTAL_CHART_ACCENT,
  SectionHeader,
  StatFrame,
  TableShell,
  chartTooltip,
} from "@/components/shared/portal-dashboard-ui";
import { SuperAdminPageHeader } from "@/components/superadmin/super-admin-ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useBulkNotifications,
  useCategories,
  useComboSets,
  useCustomers,
  useExpenses,
  useLedgers,
  useOrders,
  useOrdersAcrossRestaurantIds,
  usePlatformDefaults,
  useProducts,
  usePurchases,
  useRawMaterials,
  useRestaurants,
  useStaffMembers,
  useStockLogs,
  useSuppliers,
  useTables,
  useTransactions,
  useUnits,
} from "@/hooks/use-rest-api";
import { money } from "@/lib/money";
import { useRestaurantScope } from "@/lib/restaurant-context";
import type { PlatformDefaultsDTO } from "@/lib/super-settings-cache";
import { Link } from "@tanstack/react-router";
import {
  BarChart2,
  Bell,
  BookOpen,
  ChevronRight,
  LayoutGrid,
  Package,
  PieChart as PieChartIcon,
  Receipt,
  Settings,
  ShoppingBag,
  Store,
  TrendingUp,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const TABLE_PREVIEW = 5;
const CHART_HEX = ["#F83232", "#2563EB", "#16A34A", "#D97706", "#7C3AED", "#FF9D9D"];

interface DashboardOrder {
  id?: number;
  status?: string;
  order_type?: string;
  total?: string | number;
  created_at?: string;
  order_id?: string;
  payment_status?: string;
}

type BulkNotifRow = { id: number; title?: string; message: string; created_at: string };

function formatInr(n: number): string {
  return `₹${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function lastNDaysLabels(n: number): { key: string; label: string }[] {
  const dayMs = 24 * 60 * 60 * 1000;
  const now = new Date();
  return Array.from({ length: n }, (_, index) => {
    const date = new Date(now.getTime() - (n - 1 - index) * dayMs);
    return {
      key: dayKey(date),
      label: date.toLocaleDateString("en-US", { weekday: "short" }),
    };
  });
}

function KpiStat({
  accentClass,
  icon,
  label,
  value,
}: {
  accentClass: string;
  icon: typeof Store;
  label: string;
  value: string;
}) {
  return (
    <StatFrame accentClass={accentClass}>
      <StatCard className="h-full rounded-[0.9375rem] border-0 shadow-none" icon={icon} label={label} value={value} />
    </StatFrame>
  );
}

function Panel({
  title,
  description,
  icon: _Icon,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  icon?: typeof TrendingUp;
  children: ReactNode;
  className?: string;
}) {
  return (
    <ChartCard title={title} description={description} className={className}>
      {children}
    </ChartCard>
  );
}

function MiniTable({
  columns,
  rows,
  empty,
}: {
  columns: { key: string; header: string; className?: string }[];
  rows: Record<string, ReactNode>[];
  empty: string;
}) {
  if (!rows.length) {
    return <p className="text-sm text-text-muted py-4 text-center">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
            {columns.map((c) => (
              <th key={c.key} className={`pb-2 pr-3 ${c.className ?? ""}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-foreground">
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0">
              {columns.map((c) => (
                <td key={c.key} className={`py-2.5 pr-3 align-top ${c.className ?? ""}`}>
                  {row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OverviewTab({ restaurantId }: { restaurantId: number }) {
  const { data: orders = [], isPending: lo } = useOrders(restaurantId);
  const { data: restaurants = [], isPending: lr } = useRestaurants();
  const normalizedOrders = useMemo(() => (orders as DashboardOrder[]) ?? [], [orders]);

  const revenueLast7Days = useMemo(() => {
    const days = lastNDaysLabels(7);
    const indexByDay = new Map(days.map((item, index) => [item.key, index]));
    const series = days.map((d) => ({ ...d, revenue: 0 }));
    for (const order of normalizedOrders) {
      if (!order.created_at) continue;
      const key = new Date(order.created_at).toISOString().slice(0, 10);
      const idx = indexByDay.get(key);
      if (idx == null) continue;
      series[idx].revenue += Number(order.total ?? 0);
    }
    return series;
  }, [normalizedOrders]);

  const orderStatusData = useMemo(() => {
    const bucket: Record<string, number> = {
      pending: 0,
      accepted: 0,
      running: 0,
      ready: 0,
      rejected: 0,
      waiting_pickup: 0,
      delivered: 0,
    };
    for (const order of normalizedOrders) {
      const key = String(order.status ?? "").toLowerCase();
      if (key in bucket) bucket[key] += 1;
    }
    return Object.entries(bucket)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({ name, value }));
  }, [normalizedOrders]);

  const statusColors: Record<string, string> = {
    pending: "#D97706",
    accepted: "#2563EB",
    running: "#7C3AED",
    ready: "#16A34A",
    rejected: "#DC2626",
    waiting_pickup: "#0891B2",
    delivered: "#16A34A",
  };

  const orderCount = normalizedOrders.length;
  const revenue7d = revenueLast7Days.reduce((s, d) => s + d.revenue, 0);
  const dayKeySet = useMemo(() => new Set(revenueLast7Days.map((d) => d.key)), [revenueLast7Days]);
  const ordersIn7d = useMemo(() => {
    let n = 0;
    for (const order of normalizedOrders) {
      if (!order.created_at) continue;
      const key = new Date(order.created_at).toISOString().slice(0, 10);
      if (dayKeySet.has(key)) n += 1;
    }
    return n;
  }, [normalizedOrders, dayKeySet]);
  const avgOrder = ordersIn7d ? revenue7d / ordersIn7d : 0;
  const locationCount = (restaurants as { id: number }[]).length;

  const recentOrders = useMemo(() => {
    return [...normalizedOrders]
      .filter((o) => o.created_at)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, TABLE_PREVIEW);
  }, [normalizedOrders]);

  const statLoading = lo || lr;
  const revenueChartData = revenueLast7Days.map((d) => ({ dayLabel: d.label, revenue: d.revenue }));

  return (
    <div className="space-y-8">
      <section className="space-y-5">
        <SectionHeader
          eyebrow="Metrics"
          title="Location KPIs"
          description="Portfolio size and performance for the restaurant selected above."
        />
        <StatCardsGrid>
          <KpiStat
            accentClass="from-primary/55 via-primary/20 to-transparent"
            icon={Store}
            label="Your restaurants"
            value={statLoading ? "…" : String(locationCount)}
          />
          <KpiStat
            accentClass="from-blue-600/40 via-blue-500/12 to-transparent"
            icon={ShoppingBag}
            label="Orders (this location)"
            value={statLoading ? "…" : String(orderCount)}
          />
          <KpiStat
            accentClass="from-emerald-500/45 via-emerald-400/12 to-transparent"
            icon={TrendingUp}
            label="Revenue (7 days)"
            value={statLoading ? "…" : formatInr(revenue7d)}
          />
          <KpiStat
            accentClass="from-amber-500/50 via-amber-400/15 to-transparent"
            icon={PieChartIcon}
            label="Avg ticket (7 days)"
            value={statLoading ? "…" : formatInr(avgOrder)}
          />
        </StatCardsGrid>
      </section>

      <section className="space-y-5">
        <SectionHeader
          eyebrow="Analytics"
          title="Revenue & order pipeline"
          description="Seven-day revenue trend and current status mix for the selected location."
        />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <ChartCard
            title="Revenue trend"
            description="Last 7 days for the selected restaurant."
            className="lg:col-span-2"
          >
            <ResponsiveContainer width="100%" height={252}>
              <ComposedChart data={revenueChartData}>
                <defs>
                  <linearGradient id="ownerRevenueArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PORTAL_CHART_ACCENT} stopOpacity={0.22} />
                    <stop offset="88%" stopColor={PORTAL_CHART_ACCENT} stopOpacity={0.02} />
                    <stop offset="100%" stopColor={PORTAL_CHART_ACCENT} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="dayLabel" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                  width={48}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `₹${Number(v) >= 1000 ? `${Math.round(Number(v) / 1000)}k` : v}`}
                />
                <Tooltip {...chartTooltip} formatter={(value: number | string) => [formatInr(Number(value)), "Revenue"]} />
                <Area type="monotone" dataKey="revenue" stroke={false} fill="url(#ownerRevenueArea)" />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke={PORTAL_CHART_ACCENT}
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "var(--card)", stroke: PORTAL_CHART_ACCENT, strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Order pipeline" description="Current mix of order statuses.">
            {orderStatusData.length === 0 ? (
              <p className="py-12 text-center text-sm text-text-muted">No orders to chart yet.</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={208}>
                  <PieChart>
                    <Pie
                      data={orderStatusData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={48}
                      outerRadius={76}
                      paddingAngle={2}
                      stroke="var(--card)"
                      strokeWidth={2}
                    >
                      {orderStatusData.map((entry) => (
                        <Cell key={entry.name} fill={statusColors[entry.name] ?? CHART_HEX[4]} />
                      ))}
                    </Pie>
                    <Tooltip {...chartTooltip} />
                    <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value) => String(value).replace(/_/g, " ")} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-4 flex flex-wrap gap-2">
                  {orderStatusData.map((item) => (
                    <span
                      key={item.name}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-2.5 py-1 text-[11px] font-medium text-text-secondary shadow-sm"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full shadow-sm"
                        style={{ backgroundColor: statusColors[item.name] ?? CHART_HEX[4] }}
                      />
                      {String(item.name).replace(/_/g, " ")} ({item.value})
                    </span>
                  ))}
                </div>
              </>
            )}
          </ChartCard>
        </div>
      </section>

      <section className="space-y-5">
        <SectionHeader
          eyebrow="Lists"
          title="Recent orders"
          description="Latest activity — open Orders for the full queue."
        />
        <TableShell
          title="Orders"
          seeAllTo="/owner/orders"
          totalCount={orderCount}
          rowCount={recentOrders.length}
          emptyWhenNoRows={<p>No orders yet for this restaurant.</p>}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/80 bg-muted/40 text-left text-[11px] font-bold uppercase tracking-wide text-text-muted">
                <th className="px-4 py-2.5 sm:px-5">Order</th>
                <th className="px-4 py-2.5 sm:px-5">Type</th>
                <th className="px-4 py-2.5 sm:px-5">Status</th>
                <th className="px-4 py-2.5 text-right sm:px-5">Total</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((o) => (
                <tr
                  key={o.id ?? o.order_id}
                  className="border-b border-border/60 transition-colors odd:bg-muted/20 last:border-0 hover:bg-primary/[0.04]"
                >
                  <td className="px-4 py-3 sm:px-5">
                    {o.id != null ? (
                      <Link
                        to="/owner/orders/$id"
                        params={{ id: String(o.id) }}
                        className="font-medium text-primary hover:underline"
                      >
                        {o.order_id ?? `#${o.id}`}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 capitalize sm:px-5">{String(o.order_type ?? "—")}</td>
                  <td className="px-4 py-3 capitalize text-text-secondary sm:px-5">{String(o.status ?? "—")}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium sm:px-5">{money(o.total ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      </section>

      <section className="space-y-5">
        <SectionHeader
          eyebrow="Navigate"
          title="Workspace shortcuts"
          description="Jump into the modules you use most — aligned with the owner sidebar."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {(
            [
              {
                title: "Orders",
                desc: "Live queue and order history.",
                to: "/owner/orders",
                icon: ShoppingBag,
                stat: lo ? "…" : `${orderCount} at this location`,
                stripe: "from-blue-500 to-blue-600",
                iconBg: "bg-blue-50 text-blue-700 ring-blue-200/80",
              },
              {
                title: "Menu",
                desc: "Categories, products, and combos.",
                to: "/owner/menu",
                icon: UtensilsCrossed,
                stat: "Manage catalog",
                stripe: "from-teal-500 to-teal-600",
                iconBg: "bg-teal-50 text-teal-700 ring-teal-200/80",
              },
              {
                title: "Reports",
                desc: "Sales and operational insights.",
                to: "/owner/reports",
                icon: BarChart2,
                stat: "View analytics",
                stripe: "from-violet-500 to-violet-600",
                iconBg: "bg-violet-50 text-violet-700 ring-violet-200/80",
              },
              {
                title: "Settings",
                desc: "Restaurant preferences and billing.",
                to: "/owner/settings",
                icon: Settings,
                stat: "Configure venue",
                stripe: "from-slate-500 to-slate-600",
                iconBg: "bg-slate-100 text-slate-800 ring-slate-200/80",
              },
            ] as const
          ).map((m) => (
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
                aria-hidden
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
    </div>
  );
}

function OperationsTab({ restaurantId }: { restaurantId: number }) {
  const { data: orders = [], isPending: lo } = useOrders(restaurantId);
  const { data: bulkRaw = [], isPending: lb } = useBulkNotifications(restaurantId);
  const normalizedOrders = useMemo(() => (orders as DashboardOrder[]) ?? [], [orders]);
  const bulkList = useMemo(() => (bulkRaw as BulkNotifRow[]) ?? [], [bulkRaw]);

  const pending = normalizedOrders.filter((o) => String(o.status).toLowerCase() === "pending").length;
  const inProgress = normalizedOrders.filter((o) => ["accepted", "running"].includes(String(o.status).toLowerCase())).length;
  const ready = normalizedOrders.filter((o) => String(o.status).toLowerCase() === "ready").length;

  const ordersPerDay = useMemo(() => {
    const days = lastNDaysLabels(7);
    const indexByDay = new Map(days.map((item, index) => [item.key, index]));
    const series = days.map((d) => ({ ...d, orders: 0 }));
    for (const order of normalizedOrders) {
      if (!order.created_at) continue;
      const key = new Date(order.created_at).toISOString().slice(0, 10);
      const idx = indexByDay.get(key);
      if (idx == null) continue;
      series[idx].orders += 1;
    }
    return series;
  }, [normalizedOrders]);

  const orderTypeData = useMemo(() => {
    const bucket: Record<string, number> = { table: 0, packing: 0, delivery: 0 };
    for (const order of normalizedOrders) {
      const key = String(order.order_type ?? "").toLowerCase();
      if (key in bucket) bucket[key] += 1;
    }
    return Object.entries(bucket).map(([name, count]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      count,
    }));
  }, [normalizedOrders]);

  const recentBulk = useMemo(() => {
    return [...bulkList].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, TABLE_PREVIEW);
  }, [bulkList]);

  return (
    <div className="space-y-8">
      <section className="space-y-5">
        <SectionHeader
          eyebrow="Operations"
          title="Orders & alerts"
          description="Queue health, volume, and team broadcasts for this location."
        />
        <StatCardsGrid>
          <KpiStat accentClass="from-amber-500/50 via-amber-400/15 to-transparent" icon={ShoppingBag} label="Pending" value={lo ? "…" : String(pending)} />
          <KpiStat accentClass="from-blue-600/40 via-blue-500/12 to-transparent" icon={TrendingUp} label="In progress" value={lo ? "…" : String(inProgress)} />
          <KpiStat accentClass="from-emerald-500/45 via-emerald-400/12 to-transparent" icon={Package} label="Ready to serve" value={lo ? "…" : String(ready)} />
          <KpiStat accentClass="from-violet-500/45 via-violet-400/12 to-transparent" icon={Bell} label="Broadcasts" value={lb ? "…" : String(bulkList.length)} />
        </StatCardsGrid>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Order volume" description="Orders placed per day (last 7 days)." icon={BarChart2}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={ordersPerDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="orders" fill="#2563EB" radius={[6, 6, 0, 0]} name="Orders" />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Orders by channel" description="Table, packing, and delivery." icon={PieChartIcon}>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={orderTypeData} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={88} label>
                {orderTypeData.map((_, i) => (
                  <Cell key={i} fill={CHART_HEX[i % CHART_HEX.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel title="Team broadcasts" description="Messages sent from Notifications." icon={Bell}>
        <MiniTable
          empty="No broadcast notifications yet."
          columns={[
            { key: "title", header: "Title" },
            { key: "preview", header: "Preview" },
            { key: "sent", header: "Sent" },
          ]}
          rows={recentBulk.map((n) => ({
            title: <span className="font-medium text-foreground">{n.title?.trim() || "Announcement"}</span>,
            preview: <span className="line-clamp-2 text-text-secondary">{n.message}</span>,
            sent: (
              <span className="text-text-muted text-xs whitespace-nowrap">
                {n.created_at ? new Date(n.created_at).toLocaleString() : "—"}
              </span>
            ),
          }))}
        />
      </Panel>
    </div>
  );
}

function CatalogTab({ restaurantId }: { restaurantId: number }) {
  const { data: categories = [], isPending: lc } = useCategories(restaurantId);
  const { data: products = [], isPending: lp } = useProducts(restaurantId);
  const { data: combos = [], isPending: lco } = useComboSets(restaurantId);
  const { data: tables = [], isPending: lt } = useTables(restaurantId);
  const { data: materials = [], isPending: lm } = useRawMaterials(restaurantId);
  const { data: suppliers = [], isPending: ls } = useSuppliers(restaurantId);
  const { data: units = [] } = useUnits(restaurantId);
  const { data: stockLogs = [], isPending: lsl } = useStockLogs(restaurantId);
  const { data: purchases = [], isPending: lpu } = usePurchases();

  const purchasesHere = useMemo(
    () => (purchases as { id: number; restaurant?: number; purchase_id?: string; total?: string | number; created_at?: string }[]).filter((p) => p.restaurant === restaurantId),
    [purchases, restaurantId],
  );

  const lowStock = useMemo(() => {
    const list = materials as { id: number; name: string; stock: string | number; min_stock: string | number; unit: number }[];
    return list
      .filter((m) => Number(m.stock) <= Number(m.min_stock))
      .sort((a, b) => Number(a.stock) - Number(b.stock))
      .slice(0, TABLE_PREVIEW);
  }, [materials]);

  const stockActivity = useMemo(() => {
    const days = lastNDaysLabels(7);
    const indexByDay = new Map(days.map((item, index) => [item.key, index]));
    const series = days.map((d) => ({ ...d, movements: 0 }));
    const logs = (stockLogs as { created_at?: string }[]) ?? [];
    for (const log of logs) {
      if (!log.created_at) continue;
      const key = new Date(log.created_at).toISOString().slice(0, 10);
      const idx = indexByDay.get(key);
      if (idx == null) continue;
      series[idx].movements += 1;
    }
    return series;
  }, [stockLogs]);

  const stockTypePie = useMemo(() => {
    const bucket: Record<string, number> = {};
    for (const log of (stockLogs as { type?: string }[]) ?? []) {
      const t = String(log.type ?? "other").toLowerCase() || "other";
      bucket[t] = (bucket[t] ?? 0) + 1;
    }
    return Object.entries(bucket)
      .map(([name, value]) => ({ name, value }))
      .filter((x) => x.value > 0)
      .slice(0, 6);
  }, [stockLogs]);

  const rmName = (id: number) =>
    (materials as { id: number; name: string }[]).find((r) => r.id === id)?.name ?? `Material #${id}`;

  const unitSym = (unitId: number) =>
    (units as { id: number; symbol: string }[]).find((u) => u.id === unitId)?.symbol ?? "";

  const recentLogs = useMemo(() => {
    return [...((stockLogs as { id: number; created_at?: string; type?: string; raw_material?: number; quantity?: string | number }[]) ?? [])]
      .filter((s) => s.created_at)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, TABLE_PREVIEW);
  }, [stockLogs]);

  const recentPurchases = useMemo(() => {
    return [...purchasesHere]
      .filter((p) => p.created_at)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, TABLE_PREVIEW);
  }, [purchasesHere]);

  const inventoryHealth = useMemo(() => {
    const list = materials as { stock: string | number; min_stock: string | number }[];
    let low = 0;
    let ok = 0;
    for (const m of list) {
      if (Number(m.stock) <= Number(m.min_stock)) low += 1;
      else ok += 1;
    }
    return [
      { name: "Healthy", value: ok },
      { name: "Low / at min", value: low },
    ].filter((x) => x.value > 0);
  }, [materials]);

  return (
    <div className="space-y-4">
      <StatCardsGrid>
        <StatCard icon={UtensilsCrossed} label="Categories" value={lc ? "…" : String((categories as unknown[]).length)} />
        <StatCard icon={Package} label="Products" value={lp ? "…" : String((products as unknown[]).length)} />
        <StatCard icon={Package} label="Combo sets" value={lco ? "…" : String((combos as unknown[]).length)} />
        <StatCard icon={LayoutGrid} label="Tables" value={lt ? "…" : String((tables as unknown[]).length)} />
      </StatCardsGrid>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Stock log activity" description="Inventory movements per day." icon={TrendingUp} className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={stockActivity}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="movements" stroke="#7C3AED" strokeWidth={2} dot={{ r: 3 }} name="Movements" />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Raw material health" description="Count of SKUs above vs at/below minimum." icon={PieChartIcon}>
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie data={inventoryHealth} dataKey="value" nameKey="name" innerRadius={50} outerRadius={78}>
                {inventoryHealth.map((entry) => (
                  <Cell key={entry.name} fill={entry.name === "Healthy" ? "#16A34A" : "#F83232"} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
          <p className="text-xs text-text-muted mt-1">{ls ? "…" : `${(suppliers as unknown[]).length} suppliers linked`}</p>
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Stock movement types" description="Recent log mix ( capped to top types )." icon={BarChart2}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stockTypePie}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-12} textAnchor="end" height={48} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {stockTypePie.map((_, i) => (
                  <Cell key={i} fill={CHART_HEX[i % CHART_HEX.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Low stock watchlist" description="Items at or below minimum stock." icon={Package}>
          <MiniTable
            empty={lm ? "Loading…" : "No low-stock items. Great job."}
            columns={[
              { key: "name", header: "Material" },
              { key: "stock", header: "On hand", className: "text-right" },
              { key: "min", header: "Min", className: "text-right" },
            ]}
            rows={lowStock.map((m) => ({
              name: m.name,
              stock: (
                <span className="tabular-nums font-medium text-destructive">
                  {m.stock} {unitSym(m.unit)}
                </span>
              ),
              min: (
                <span className="tabular-nums text-text-muted">
                  {m.min_stock} {unitSym(m.unit)}
                </span>
              ),
            }))}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Recent stock entries" description="From Stock Log." icon={Receipt}>
          <MiniTable
            empty={lsl ? "Loading…" : "No stock movements recorded."}
            columns={[
              { key: "when", header: "When" },
              { key: "type", header: "Type" },
              { key: "item", header: "Material" },
            ]}
            rows={recentLogs.map((s) => ({
              when: (
                <span className="text-xs text-text-muted whitespace-nowrap">
                  {s.created_at ? new Date(s.created_at).toLocaleString() : "—"}
                </span>
              ),
              type: <span className="capitalize">{String(s.type ?? "—")}</span>,
              item: rmName(Number(s.raw_material)),
            }))}
          />
        </Panel>

        <Panel title="Recent purchases" description="Inventory purchases for this location." icon={ShoppingBag}>
          <MiniTable
            empty={lpu ? "Loading…" : "No purchases recorded."}
            columns={[
              { key: "pid", header: "Purchase" },
              { key: "total", header: "Total", className: "text-right" },
              { key: "when", header: "When" },
            ]}
            rows={recentPurchases.map((p) => ({
              pid: (
                <span className="font-medium">
                  {p.purchase_id ?? (p.id != null ? `#${p.id}` : "—")}
                </span>
              ),
              total: <span className="tabular-nums font-medium">{money(p.total ?? 0)}</span>,
              when: (
                <span className="text-xs text-text-muted whitespace-nowrap">
                  {p.created_at ? new Date(p.created_at).toLocaleString() : "—"}
                </span>
              ),
            }))}
          />
        </Panel>
      </div>
    </div>
  );
}

function FinanceTab({ restaurantId }: { restaurantId: number }) {
  const { data: transactions = [], isPending: lt } = useTransactions(restaurantId);
  const { data: expenses = [], isPending: le } = useExpenses(restaurantId);
  const { data: ledger = [], isPending: ll } = useLedgers(restaurantId);
  const { data: customers = [], isPending: lc } = useCustomers(restaurantId);
  const { data: staff = [], isPending: ls } = useStaffMembers(restaurantId);

  const expenseSeries = useMemo(() => {
    const days = lastNDaysLabels(7);
    const indexByDay = new Map(days.map((item, index) => [item.key, index]));
    const series = days.map((d) => ({ ...d, spent: 0 }));
    for (const row of (expenses as { expense_date?: string; amount?: string | number }[]) ?? []) {
      const raw = row.expense_date;
      if (!raw) continue;
      const key = new Date(raw).toISOString().slice(0, 10);
      const idx = indexByDay.get(key);
      if (idx == null) continue;
      series[idx].spent += Number(row.amount ?? 0);
    }
    return series;
  }, [expenses]);

  const expenseTotal7d = expenseSeries.reduce((s, d) => s + d.spent, 0);

  const txRows = useMemo(
    () =>
      (transactions as {
        id: number;
        amount: string | number;
        transaction_type: string;
        payment_status: string;
        category: string;
        created_at?: string;
      }[]) ?? [],
    [transactions],
  );

  const txFlowPie = useMemo(() => {
    let ins = 0;
    let outs = 0;
    for (const t of txRows) {
      const flow = String(t.transaction_type).toLowerCase();
      if (flow === "in") ins += 1;
      else if (flow === "out") outs += 1;
    }
    return [
      { name: "Money in", value: ins },
      { name: "Money out", value: outs },
    ].filter((x) => x.value > 0);
  }, [txRows]);

  const recentTx = useMemo(() => {
    return [...txRows]
      .filter((t) => t.id != null)
      .sort((a, b) => String(b.created_at ?? b.id).localeCompare(String(a.created_at ?? a.id)))
      .slice(0, TABLE_PREVIEW);
  }, [txRows]);

  const recentExpenses = useMemo(() => {
    return [...((expenses as { id: number; expense_id?: string; particular?: string; amount?: string | number; expense_date?: string }[]) ?? [])]
      .filter((e) => e.expense_date)
      .sort((a, b) => String(b.expense_date).localeCompare(String(a.expense_date)))
      .slice(0, TABLE_PREVIEW);
  }, [expenses]);

  const recentLedger = useMemo(() => {
    return [...((ledger as { id: number; particular?: string; amount?: string | number; type?: string; created_at?: string }[]) ?? [])]
      .filter((r) => r.created_at)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, TABLE_PREVIEW);
  }, [ledger]);

  const recentCustomers = useMemo(() => {
    return [...((customers as { id: number; name?: string; phone?: string }[]) ?? [])].slice(0, TABLE_PREVIEW);
  }, [customers]);

  const recentStaff = useMemo(() => {
    return [...((staff as { id: number; user_name?: string; role?: string; joined_at?: string }[]) ?? [])]
      .sort((a, b) => String(b.joined_at ?? "").localeCompare(String(a.joined_at ?? "")))
      .slice(0, TABLE_PREVIEW);
  }, [staff]);

  return (
    <div className="space-y-4">
      <StatCardsGrid>
        <StatCard icon={Receipt} label="Expenses (7 days)" value={le ? "…" : formatInr(expenseTotal7d)} />
        <StatCard icon={Users} label="Customers" value={lc ? "…" : String((customers as unknown[]).length)} />
        <StatCard icon={Users} label="Staff seats" value={ls ? "…" : String((staff as unknown[]).length)} />
        <StatCard icon={BookOpen} label="Ledger lines" value={ll ? "…" : String((ledger as unknown[]).length)} />
      </StatCardsGrid>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Expense trend" description="Recorded expenses by day." icon={TrendingUp} className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={expenseSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${v}`} />
              <Tooltip formatter={(v: number) => [formatInr(Number(v)), "Spent"]} />
              <Line type="monotone" dataKey="spent" stroke="#D97706" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Transaction flow" description="In vs out entries (counts)." icon={PieChartIcon}>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={txFlowPie} dataKey="value" nameKey="name" innerRadius={54} outerRadius={86}>
                {txFlowPie.map((entry) => (
                  <Cell key={entry.name} fill={entry.name === "Money in" ? "#16A34A" : "#F83232"} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
          <p className="text-xs text-text-muted mt-1">{lt ? "Loading transactions…" : `${transactions.length} rows in register`}</p>
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Recent transactions" description="Cash and digital movements." icon={BarChart2}>
          <MiniTable
            empty={lt ? "Loading…" : "No transactions yet."}
            columns={[
              { key: "flow", header: "Flow" },
              { key: "amount", header: "Amount", className: "text-right" },
              { key: "pay", header: "Payment" },
            ]}
            rows={recentTx.map((t) => ({
              flow: <span className="capitalize font-medium">{String(t.transaction_type)}</span>,
              amount: <span className="tabular-nums font-semibold">{money(t.amount)}</span>,
              pay: <span className="capitalize text-xs text-text-secondary">{String(t.payment_status)}</span>,
            }))}
          />
        </Panel>

        <Panel title="Recent expenses" description="Operational spend." icon={Receipt}>
          <MiniTable
            empty={le ? "Loading…" : "No expenses logged."}
            columns={[
              { key: "ex", header: "ID" },
              { key: "part", header: "Particulars" },
              { key: "amt", header: "Amount", className: "text-right" },
            ]}
            rows={recentExpenses.map((e) => ({
              ex: <span className="font-mono text-xs">{e.expense_id ?? `#${e.id}`}</span>,
              part: <span className="line-clamp-2">{e.particular ?? "—"}</span>,
              amt: <span className="tabular-nums font-medium">{money(e.amount ?? 0)}</span>,
            }))}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Ledger activity" description="Latest postings across parties." icon={BookOpen}>
          <MiniTable
            empty={ll ? "Loading…" : "No ledger entries."}
            columns={[
              { key: "part", header: "Particular" },
              { key: "type", header: "Type" },
              { key: "amt", header: "Amount", className: "text-right" },
            ]}
            rows={recentLedger.map((r) => ({
              part: <span className="line-clamp-2">{r.particular ?? "—"}</span>,
              type: <span className="capitalize text-xs">{String(r.type ?? "—")}</span>,
              amt: <span className="tabular-nums">{money(r.amount ?? 0)}</span>,
            }))}
          />
        </Panel>

        <Panel title="Customers & team" description="Snapshot lists — open full pages for detail." icon={Users}>
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Customers</p>
          <MiniTable
            empty={lc ? "Loading…" : "No customers yet."}
            columns={[
              { key: "name", header: "Name" },
              { key: "phone", header: "Phone" },
            ]}
            rows={recentCustomers.map((c) => ({
              name: c.name?.trim() || "—",
              phone: <span className="text-text-secondary">{c.phone ?? "—"}</span>,
            }))}
          />

          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mt-5 mb-2">Staff</p>
          <MiniTable
            empty={ls ? "Loading…" : "No staff assigned."}
            columns={[
              { key: "name", header: "Name" },
              { key: "role", header: "Role" },
            ]}
            rows={recentStaff.map((s) => ({
              name: s.user_name ?? "—",
              role: <span className="capitalize">{String(s.role ?? "—")}</span>,
            }))}
          />
        </Panel>
      </div>
    </div>
  );
}

const DASHBOARD_ALL_VENUES_VALUE = "__all_venues__";

function AllVenuesComparisonPanel({
  restaurantIds,
  restaurants,
  onDrillIntoRestaurant,
}: {
  restaurantIds: number[];
  restaurants: { id: number; name: string }[];
  onDrillIntoRestaurant: (id: number) => void;
}) {
  const orderQueries = useOrdersAcrossRestaurantIds(restaurantIds, restaurantIds.length > 0);

  const rows = useMemo(() => {
    return restaurantIds.map((rid, i) => {
      const q = orderQueries[i];
      const normalizedOrders = ((q?.data as DashboardOrder[]) ?? []) as DashboardOrder[];
      const days = lastNDaysLabels(7);
      const dayKeySet = new Set(days.map((d) => d.key));
      let revenue7d = 0;
      let ordersIn7d = 0;
      for (const order of normalizedOrders) {
        if (!order.created_at) continue;
        const key = new Date(order.created_at).toISOString().slice(0, 10);
        if (!dayKeySet.has(key)) continue;
        revenue7d += Number(order.total ?? 0);
        ordersIn7d += 1;
      }
      const pending = normalizedOrders.filter((o) => String(o.status).toLowerCase() === "pending").length;
      const name = restaurants.find((r) => r.id === rid)?.name ?? `Restaurant #${rid}`;
      const loading = q?.isPending ?? true;
      const avgTicket = ordersIn7d > 0 ? revenue7d / ordersIn7d : 0;
      return {
        rid,
        name,
        orderCount: normalizedOrders.length,
        revenue7d,
        ordersIn7d,
        pending,
        avgTicket,
        loading,
      };
    });
  }, [restaurantIds, restaurants, orderQueries]);

  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        name: r.name.length > 18 ? `${r.name.slice(0, 16)}…` : r.name,
        revenue: r.revenue7d,
        fullName: r.name,
      })),
    [rows],
  );

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.revenue += r.revenue7d;
        acc.orders7d += r.ordersIn7d;
        acc.totalOrders += r.orderCount;
        acc.pending += r.pending;
        return acc;
      },
      { revenue: 0, orders7d: 0, totalOrders: 0, pending: 0 },
    );
  }, [rows]);

  return (
    <div className="space-y-8">
      <section className="space-y-5">
        <SectionHeader
          eyebrow="Compare"
          title="All locations"
          description="Side-by-side metrics across your restaurants — pick one to open the full dashboard."
        />
        <StatCardsGrid>
          <KpiStat accentClass="from-primary/55 via-primary/20 to-transparent" icon={Store} label="Locations compared" value={String(restaurantIds.length)} />
          <KpiStat accentClass="from-blue-600/40 via-blue-500/12 to-transparent" icon={ShoppingBag} label="Orders (all locations)" value={String(totals.totalOrders)} />
          <KpiStat accentClass="from-emerald-500/45 via-emerald-400/12 to-transparent" icon={TrendingUp} label="Revenue (7 days, all)" value={formatInr(totals.revenue)} />
          <KpiStat accentClass="from-amber-500/50 via-amber-400/15 to-transparent" icon={PieChartIcon} label="Pending (all)" value={String(totals.pending)} />
        </StatCardsGrid>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Revenue by location" description="Last 7 days — quick visual comparison." icon={BarChart2} className="lg:col-span-1">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--text-muted)" tickFormatter={(v) => `₹${v}`} />
              <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} stroke="var(--text-muted)" />
              <Tooltip
                formatter={(value: number) => [formatInr(Number(value)), "Revenue (7d)"]}
                labelFormatter={(_, payload) => {
                  const p = payload?.[0]?.payload as { fullName?: string; name?: string } | undefined;
                  return p?.fullName ?? p?.name ?? "";
                }}
              />
              <Bar dataKey="revenue" fill="#F83232" radius={[0, 6, 6, 0]} name="Revenue" />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Per-location metrics" description="Open a location for full dashboard tabs." icon={Store}>
          <MiniTable
            empty="No restaurants to compare."
            columns={[
              { key: "name", header: "Restaurant" },
              { key: "orders", header: "Orders", className: "text-right tabular-nums" },
              { key: "rev", header: "Revenue (7d)", className: "text-right tabular-nums" },
              { key: "pend", header: "Pending", className: "text-right tabular-nums" },
              { key: "avg", header: "Avg ticket (7d)", className: "text-right tabular-nums hidden sm:table-cell" },
              { key: "action", header: "" },
            ]}
            rows={rows.map((r) => ({
              name: (
                <span className="font-medium text-foreground">
                  {r.loading ? <span className="text-text-muted">…</span> : r.name}
                </span>
              ),
              orders: r.loading ? "…" : String(r.orderCount),
              rev: r.loading ? "…" : formatInr(r.revenue7d),
              pend: r.loading ? "…" : String(r.pending),
              avg: r.loading ? "…" : formatInr(Math.round(r.avgTicket)),
              action: (
                <button
                  type="button"
                  onClick={() => onDrillIntoRestaurant(r.rid)}
                  className="text-xs font-semibold text-primary hover:underline whitespace-nowrap"
                >
                  View
                </button>
              ),
            }))}
          />
        </Panel>
      </div>

      <p className="text-xs text-text-muted">
        Comparison uses order history per location. Other areas (inventory, ledger) stay on the single-location view when
        you pick a restaurant above.
      </p>
    </div>
  );
}

export function OwnerHomeDashboard() {
  const { restaurantId, setRestaurantId, restaurantIds } = useRestaurantScope();
  const { data: restaurants = [] } = useRestaurants();
  const { data: platformDefaults } = usePlatformDefaults();
  const [tab, setTab] = useState("overview");
  const multiVenue = restaurantIds.length > 1;
  const [compareAllVenues, setCompareAllVenues] = useState(false);

  useEffect(() => {
    if (!multiVenue) setCompareAllVenues(false);
  }, [multiVenue]);

  const restaurantList = restaurants as { id: number; name: string }[];
  const ownedRestaurants = useMemo(() => {
    const fromList = restaurantList
      .filter((r) => restaurantIds.includes(r.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (fromList.length > 0) return fromList;
    return restaurantIds.map((id) => ({ id, name: `Restaurant #${id}` }));
  }, [restaurantList, restaurantIds]);

  const selectValue = compareAllVenues && multiVenue ? DASHBOARD_ALL_VENUES_VALUE : String(restaurantId ?? "");

  const onVenueSelect = useCallback(
    (value: string) => {
      if (value === DASHBOARD_ALL_VENUES_VALUE) {
        setCompareAllVenues(true);
        return;
      }
      setCompareAllVenues(false);
      const id = Number(value);
      if (Number.isFinite(id) && id > 0) setRestaurantId(id);
    },
    [setRestaurantId],
  );

  const drillIntoRestaurant = useCallback(
    (id: number) => {
      setCompareAllVenues(false);
      setRestaurantId(id);
    },
    [setRestaurantId],
  );

  const dueAlert = useMemo(() => {
    if (restaurantId == null) return null;
    if (compareAllVenues && multiVenue) return null;
    const pd = platformDefaults as PlatformDefaultsDTO | undefined;
    const r = (restaurants as { id: number; due_balance?: string | number; effective_due_threshold?: string | number }[]).find(
      (x) => x.id === restaurantId,
    );
    const threshold = r != null ? Number(r.effective_due_threshold ?? pd?.due_threshold ?? NaN) : NaN;
    if (!Number.isFinite(threshold) || threshold <= 0) return null;
    const due = r != null ? Number(r.due_balance ?? 0) : NaN;
    if (!Number.isFinite(due) || due < threshold) return null;
    return { due, threshold };
  }, [restaurantId, restaurants, platformDefaults, compareAllVenues, multiVenue]);

  if (restaurantId == null) {
    return <p className="text-sm text-text-muted p-4">No restaurant context.</p>;
  }

  const selectedRestaurantName =
    compareAllVenues && multiVenue
      ? "All restaurants (compare)"
      : (ownedRestaurants.find((r) => r.id === restaurantId)?.name ?? "Selected location");

  return (
    <div className="space-y-8 pb-10">
      {dueAlert ? (
        <div
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
          role="status"
        >
          <p className="font-semibold">Due balance alert</p>
          <p className="mt-1 text-amber-900/90 dark:text-amber-100/90">
            This restaurant&apos;s due balance ({formatInr(dueAlert.due)}) has reached or exceeded the platform due
            threshold ({formatInr(dueAlert.threshold)}). Please settle with the platform team.
          </p>
        </div>
      ) : null}

      <SuperAdminPageHeader
        title="Dashboard"
        description={`Operational snapshot for ${selectedRestaurantName}. KPIs, charts, and previews match the super admin and shareholder portal layout.`}
        actions={
          ownedRestaurants.length > 0 ? (
            <div className="w-full sm:w-64">
              <label htmlFor="dashboard-restaurant-scope" className="mb-1.5 block text-xs font-semibold text-text-secondary">
                Restaurant
              </label>
              <Select value={selectValue} onValueChange={onVenueSelect}>
                <SelectTrigger id="dashboard-restaurant-scope" className="w-full rounded-xl border-border/90 bg-background shadow-sm">
                  <SelectValue placeholder="Choose restaurant" />
                </SelectTrigger>
                <SelectContent>
                  {multiVenue ? (
                    <SelectItem value={DASHBOARD_ALL_VENUES_VALUE}>All restaurants (compare)</SelectItem>
                  ) : null}
                  {ownedRestaurants.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null
        }
      />

      {compareAllVenues && multiVenue ? (
        <AllVenuesComparisonPanel
          restaurantIds={restaurantIds}
          restaurants={restaurantList}
          onDrillIntoRestaurant={drillIntoRestaurant}
        />
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="space-y-8">
          <TabsList className="inline-flex h-auto w-full flex-wrap gap-1 rounded-2xl border border-border/90 bg-muted/30 p-1 shadow-sm ring-1 ring-black/[0.02] sm:w-auto">
            <TabsTrigger
              value="overview"
              className="rounded-xl px-4 py-2 text-xs font-semibold data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:text-sm"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="operations"
              className="rounded-xl px-4 py-2 text-xs font-semibold data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:text-sm"
            >
              Orders &amp; alerts
            </TabsTrigger>
            <TabsTrigger
              value="catalog"
              className="rounded-xl px-4 py-2 text-xs font-semibold data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:text-sm"
            >
              Menu &amp; inventory
            </TabsTrigger>
            <TabsTrigger
              value="finance"
              className="rounded-xl px-4 py-2 text-xs font-semibold data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:text-sm"
            >
              People &amp; finance
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
            <OverviewTab restaurantId={restaurantId} />
          </TabsContent>
          <TabsContent value="operations" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
            <OperationsTab restaurantId={restaurantId} />
          </TabsContent>
          <TabsContent value="catalog" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
            <CatalogTab restaurantId={restaurantId} />
          </TabsContent>
          <TabsContent value="finance" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
            <FinanceTab restaurantId={restaurantId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
