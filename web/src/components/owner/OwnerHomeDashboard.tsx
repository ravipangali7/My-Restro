import { StatCard, StatCardsGrid } from "@/components/shared/StatCard";
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
  ArrowRight,
  BarChart2,
  Bell,
  BookOpen,
  LayoutGrid,
  Package,
  PieChart as PieChartIcon,
  Receipt,
  ShoppingBag,
  Store,
  TrendingUp,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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

function SeeAllLink({ to, label = "See all" }: { to: string; label?: string }) {
  return (
    <div className="flex justify-end border-t border-border pt-3 mt-1">
      <Link
        to={to}
        className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary-600 transition-colors"
      >
        {label}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  );
}

function Panel({
  title,
  description,
  icon: Icon,
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
    <section
      className={`rounded-2xl border border-border bg-card shadow-sm overflow-hidden ${className}`}
    >
      <div className="px-4 py-3 border-b border-border bg-gradient-to-r from-primary-50/80 to-transparent">
        <div className="flex items-start gap-2">
          {Icon ? (
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-sm text-foreground">{title}</h3>
            {description ? <p className="text-xs text-text-muted mt-0.5">{description}</p> : null}
          </div>
        </div>
      </div>
      <div className="p-4">{children}</div>
    </section>
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

  return (
    <div className="space-y-4">
      <StatCardsGrid>
        <StatCard icon={Store} label="Your restaurants" value={lr ? "…" : String(locationCount)} />
        <StatCard icon={ShoppingBag} label="Orders (this location)" value={lo ? "…" : String(orderCount)} />
        <StatCard icon={TrendingUp} label="Revenue (7 days)" value={lo ? "…" : formatInr(revenue7d)} />
        <StatCard icon={PieChartIcon} label="Avg ticket (7 days)" value={lo ? "…" : formatInr(avgOrder)} />
      </StatCardsGrid>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Revenue trend" description="Last 7 days for the selected restaurant." icon={TrendingUp} className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={revenueLast7Days}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" tickFormatter={(v) => `₹${v}`} />
              <Tooltip formatter={(value: number) => [formatInr(Number(value)), "Revenue"]} />
              <Line type="monotone" dataKey="revenue" stroke="#F83232" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Order pipeline" description="Current mix of order statuses." icon={PieChartIcon}>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={orderStatusData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={2}>
                {orderStatusData.map((entry) => (
                  <Cell key={entry.name} fill={statusColors[entry.name] ?? CHART_HEX[4]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value) => String(value).replace(/_/g, " ")} />
            </PieChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel title="Recent orders" description="Latest activity from Orders." icon={ShoppingBag}>
        <MiniTable
          empty="No orders yet for this restaurant."
          columns={[
            { key: "id", header: "Order" },
            { key: "type", header: "Type" },
            { key: "status", header: "Status" },
            { key: "total", header: "Total", className: "text-right" },
          ]}
          rows={recentOrders.map((o) => ({
            id: o.id != null ? (
              <Link to="/owner/orders/$id" params={{ id: String(o.id) }} className="font-medium text-primary hover:underline">
                {o.order_id ?? `#${o.id}`}
              </Link>
            ) : (
              "—"
            ),
            type: <span className="capitalize">{String(o.order_type ?? "—")}</span>,
            status: <span className="capitalize text-text-secondary">{String(o.status ?? "—")}</span>,
            total: <span className="tabular-nums font-medium">{money(o.total ?? 0)}</span>,
          }))}
        />
        <SeeAllLink to="/owner/orders" />
      </Panel>

      <div className="flex flex-wrap gap-2">
        <Link
          to="/owner/reports"
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/60 transition-colors"
        >
          <BarChart2 className="h-4 w-4 text-primary" />
          Reports
        </Link>
        <Link
          to="/owner/settings"
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/60 transition-colors"
        >
          Settings
        </Link>
      </div>
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
    <div className="space-y-4">
      <StatCardsGrid>
        <StatCard icon={ShoppingBag} label="Pending" value={lo ? "…" : String(pending)} />
        <StatCard icon={TrendingUp} label="In progress" value={lo ? "…" : String(inProgress)} />
        <StatCard icon={Package} label="Ready to serve" value={lo ? "…" : String(ready)} />
        <StatCard icon={Bell} label="Broadcasts" value={lb ? "…" : String(bulkList.length)} />
      </StatCardsGrid>

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
        <SeeAllLink to="/owner/notifications" label="See all notifications" />
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
          <SeeAllLink to="/owner/rawmaterials" />
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
          <SeeAllLink to="/owner/stocklog" />
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
          <SeeAllLink to="/owner/purchases" />
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
          <SeeAllLink to="/owner/transactions" />
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
          <SeeAllLink to="/owner/expenses" />
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
          <SeeAllLink to="/owner/ledger" />
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
          <SeeAllLink to="/owner/customers" />

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
          <SeeAllLink to="/owner/staff" />
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
    <div className="space-y-4">
      <StatCardsGrid>
        <StatCard icon={Store} label="Locations compared" value={String(restaurantIds.length)} />
        <StatCard icon={ShoppingBag} label="Orders (all locations)" value={String(totals.totalOrders)} />
        <StatCard icon={TrendingUp} label="Revenue (7 days, all)" value={formatInr(totals.revenue)} />
        <StatCard icon={PieChartIcon} label="Pending (all)" value={String(totals.pending)} />
      </StatCardsGrid>

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

  return (
    <div className="space-y-6 max-w-[120rem] mx-auto pb-2">
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
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-primary-50/90 to-transparent" aria-hidden />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Owner overview</p>
          </div>
          {ownedRestaurants.length > 0 ? (
            <div className="w-full shrink-0 lg:w-72">
              <label htmlFor="dashboard-restaurant-scope" className="text-xs font-semibold text-text-secondary block mb-1.5">
                Restaurant
              </label>
              <Select value={selectValue} onValueChange={onVenueSelect}>
                <SelectTrigger id="dashboard-restaurant-scope" className="w-full rounded-xl bg-background">
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
          ) : null}
        </div>
      </div>

      {compareAllVenues && multiVenue ? (
        <AllVenuesComparisonPanel
          restaurantIds={restaurantIds}
          restaurants={restaurantList}
          onDrillIntoRestaurant={drillIntoRestaurant}
        />
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="space-y-5">
          <TabsList className="h-auto w-full flex flex-wrap gap-1.5 justify-start rounded-xl bg-muted/70 p-1.5 sm:inline-flex sm:w-auto">
            <TabsTrigger value="overview" className="rounded-lg px-3 py-2 text-xs sm:text-sm">
              Overview
            </TabsTrigger>
            <TabsTrigger value="operations" className="rounded-lg px-3 py-2 text-xs sm:text-sm">
              Orders &amp; alerts
            </TabsTrigger>
            <TabsTrigger value="catalog" className="rounded-lg px-3 py-2 text-xs sm:text-sm">
              Menu &amp; inventory
            </TabsTrigger>
            <TabsTrigger value="finance" className="rounded-lg px-3 py-2 text-xs sm:text-sm">
              People &amp; finance
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-0 space-y-4 focus-visible:outline-none focus-visible:ring-0">
            <OverviewTab restaurantId={restaurantId} />
          </TabsContent>
          <TabsContent value="operations" className="mt-0 space-y-4 focus-visible:outline-none focus-visible:ring-0">
            <OperationsTab restaurantId={restaurantId} />
          </TabsContent>
          <TabsContent value="catalog" className="mt-0 space-y-4 focus-visible:outline-none focus-visible:ring-0">
            <CatalogTab restaurantId={restaurantId} />
          </TabsContent>
          <TabsContent value="finance" className="mt-0 space-y-4 focus-visible:outline-none focus-visible:ring-0">
            <FinanceTab restaurantId={restaurantId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
