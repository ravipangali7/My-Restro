import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import { DataTable } from "@/components/shared/DataTable";
import { StatCard, StatCardsGrid } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Colors } from "@/constants/colors";
import {
  useExpenses,
  useOrders,
  useOrdersAcrossRestaurantIds,
  useOwnerExpensesByRestaurant,
  useOwnerProductItemsByRestaurant,
  useOwnerProductsByRestaurant,
  useOwnerRawMaterialsByRestaurant,
  useOwnerStaffByRestaurant,
  useProductItems,
  useProducts,
  usePurchases,
  useRawMaterials,
  useRestaurants,
  useTransactions,
} from "@/hooks/use-rest-api";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Building2,
  Package,
  PieChart as PieChartIcon,
  Receipt,
  ShoppingBag,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

export const Route = createFileRoute("/owner/reports")({ component: ReportsPage });

const PIE_COLORS = [Colors.chart1, Colors.chart3, Colors.chart4, Colors.chart5, Colors.chart6, Colors.chart2];

function formatInr(n: number): string {
  if (!Number.isFinite(n)) return "₹0";
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function monthSortKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function humanizeKey(s: string): string {
  return s.replace(/_/g, " ");
}

type OrderRow = {
  id: number;
  order_id: string;
  restaurant: number;
  restaurant_name?: string;
  status: string;
  payment_status: string;
  payment_method?: string;
  order_type?: string;
  total: string | number;
  created_at: string;
  waiter?: number | null;
  customer_name?: string | null;
  guest_customer_name?: string;
  items?: { product?: number | null; product_item?: number | null; quantity?: string | number }[];
};

type StaffRow = {
  id: number;
  user: number;
  user_name?: string;
  user_phone?: string;
  restaurant: number;
  restaurant_name?: string;
  role: string;
  salary: string | number;
  is_suspend: boolean;
};

type TxnRow = {
  amount: string | number;
  transaction_type: string;
  category: string;
  payment_status: string;
  created_at: string;
  restaurant?: number;
  restaurant_name?: string;
};

type ExpenseRow = { id: number; restaurant?: number; category: string; amount: string | number; particular?: string };

type PurchaseRow = {
  id: number;
  restaurant?: number;
  restaurant_name?: string;
  purchase_id: string;
  total: string | number;
  created_at: string;
};

function ReportsPage() {
  const navigate = useNavigate();
  const { restaurantIds } = useRestaurantScope();
  const { data: restaurants } = useRestaurants();
  const [scope, setScope] = useState<number | "all">("all");

  useEffect(() => {
    if (restaurantIds.length === 1) {
      setScope(restaurantIds[0]!);
      return;
    }
    setScope((prev) => {
      if (prev === "all") return "all";
      if (typeof prev === "number" && restaurantIds.includes(prev)) return prev;
      return "all";
    });
  }, [restaurantIds]);

  const isAll = scope === "all";
  const activeRestaurantId = typeof scope === "number" ? scope : null;

  const restaurantNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of (restaurants as { id: number; name: string }[] | undefined) ?? []) {
      m.set(r.id, r.name);
    }
    for (const id of restaurantIds) {
      if (!m.has(id)) m.set(id, `Restaurant #${id}`);
    }
    return m;
  }, [restaurants, restaurantIds]);

  const orderQueries = useOrdersAcrossRestaurantIds(restaurantIds, isAll && restaurantIds.length > 0);
  const { data: singleOrders } = useOrders(isAll ? null : activeRestaurantId);

  const mergedOrders = useMemo(() => {
    if (isAll) {
      return orderQueries.flatMap((q) => (q.data as OrderRow[] | undefined) ?? []);
    }
    return (singleOrders as OrderRow[] | undefined) ?? [];
  }, [isAll, orderQueries, singleOrders]);

  const ordersLoading = isAll ? orderQueries.some((q) => q.isPending) : singleOrders === undefined;

  const { mergedProducts: allProducts, isPending: productsAllPending } = useOwnerProductsByRestaurant({
    enabled: isAll && restaurantIds.length > 0,
  });
  const { mergedItems: allItems, isPending: itemsAllPending } = useOwnerProductItemsByRestaurant({
    enabled: isAll && restaurantIds.length > 0,
  });
  const { data: singleProducts } = useProducts(isAll ? null : activeRestaurantId);
  const { data: singleItems } = useProductItems(isAll ? null : activeRestaurantId);

  const products = isAll ? allProducts : ((singleProducts as { id: number; name: string }[]) ?? []);
  const productItems = isAll
    ? allItems
    : (((singleItems as { id: number; product: number }[]) ?? []).map((it) => ({
        ...it,
        restaurantId: activeRestaurantId!,
      })) as { id: number; product: number; restaurantId: number }[]);

  const { sections: rmSections, isPending: rmAllPending } = useOwnerRawMaterialsByRestaurant({
    enabled: isAll && restaurantIds.length > 0,
  });
  const { data: singleRm } = useRawMaterials(isAll ? null : activeRestaurantId);

  const rawMaterialsFlat = useMemo(() => {
    if (isAll) {
      return rmSections.flatMap((s) =>
        (s.rawMaterials as { id: number; name: string; stock: string | number; min_stock: string | number }[]).map(
          (m) => ({
            ...m,
            restaurantId: s.restaurantId,
            restaurant_name: restaurantNameById.get(s.restaurantId) ?? `Restaurant #${s.restaurantId}`,
          }),
        ),
      );
    }
    return ((singleRm as { id: number; name: string; stock: string | number; min_stock: string | number }[]) ?? []).map(
      (m) => ({
        ...m,
        restaurantId: activeRestaurantId!,
        restaurant_name: restaurantNameById.get(activeRestaurantId!) ?? "",
      }),
    );
  }, [isAll, rmSections, singleRm, activeRestaurantId, restaurantNameById]);

  const { mergedExpenses: allExpenses, isPending: expAllPending } = useOwnerExpensesByRestaurant({
    enabled: isAll && restaurantIds.length > 0,
  });
  const { data: singleExpenses } = useExpenses(isAll ? null : activeRestaurantId);

  const expensesList = useMemo(() => {
    if (isAll) return (allExpenses as ExpenseRow[]) ?? [];
    return (singleExpenses as ExpenseRow[] | undefined) ?? [];
  }, [isAll, allExpenses, singleExpenses]);

  const expensesFiltered = useMemo(() => {
    if (isAll) return expensesList;
    return expensesList.filter((e) => e.restaurant === activeRestaurantId);
  }, [isAll, expensesList, activeRestaurantId]);

  const { data: txnsAll } = useTransactions(null, { allOwned: true });
  const { data: txnsSingle } = useTransactions(isAll ? null : activeRestaurantId);

  const transactions = useMemo(() => {
    const list = (isAll ? txnsAll : txnsSingle) as TxnRow[] | undefined;
    return list ?? [];
  }, [isAll, txnsAll, txnsSingle]);

  const transactionsScoped = useMemo(() => {
    if (isAll) return transactions;
    return transactions.filter((t) => {
      const row = t as TxnRow & { restaurant?: number };
      return row.restaurant == null || row.restaurant === activeRestaurantId;
    });
  }, [isAll, transactions, activeRestaurantId]);

  const { data: purchasesData } = usePurchases(isAll ? undefined : activeRestaurantId ?? undefined);
  const purchases = (purchasesData as PurchaseRow[] | undefined) ?? [];

  const purchasesFiltered = useMemo(() => {
    if (isAll) return purchases;
    return purchases.filter((p) => p.restaurant === activeRestaurantId);
  }, [isAll, purchases, activeRestaurantId]);

  const { allStaff, isPending: staffPending } = useOwnerStaffByRestaurant({ enabled: restaurantIds.length > 0 });

  const staffRows = useMemo(() => {
    const list = (allStaff as StaffRow[]) ?? [];
    if (isAll) return list;
    return list.filter((s) => s.restaurant === activeRestaurantId);
  }, [allStaff, isAll, activeRestaurantId]);

  const waiterNameByUserId = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of (allStaff as StaffRow[]) ?? []) {
      m.set(s.user, s.user_name ?? `User #${s.user}`);
    }
    return m;
  }, [allStaff]);

  const productNameByRestProduct = useMemo(() => {
    const m = new Map<string, string>();
    if (isAll) {
      for (const p of products as { id: number; name: string; restaurantId: number }[]) {
        m.set(`${p.restaurantId}:${p.id}`, p.name);
      }
    } else {
      for (const p of products as { id: number; name: string }[]) {
        m.set(`${activeRestaurantId}:${p.id}`, p.name);
      }
    }
    return m;
  }, [products, isAll, activeRestaurantId]);

  const productIdByRestItem = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of productItems as { id: number; product: number; restaurantId: number }[]) {
      m.set(`${it.restaurantId}:${it.id}`, it.product);
    }
    return m;
  }, [productItems]);

  const topProducts = useMemo(() => {
    const qtyByLabel: Record<string, number> = {};
    for (const o of mergedOrders) {
      const rid = o.restaurant;
      for (const oi of o.items ?? []) {
        let name: string | undefined;
        if (oi.product != null) name = productNameByRestProduct.get(`${rid}:${oi.product}`);
        if (!name && oi.product_item != null) {
          const pid = productIdByRestItem.get(`${rid}:${oi.product_item}`);
          if (pid != null) name = productNameByRestProduct.get(`${rid}:${pid}`);
        }
        const base = name ?? "Unknown";
        const label = isAll && restaurantNameById.get(rid) ? `${restaurantNameById.get(rid)} · ${base}` : base;
        const q = Number(oi.quantity ?? 0);
        qtyByLabel[label] = (qtyByLabel[label] || 0) + q;
      }
    }
    return Object.entries(qtyByLabel)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 14);
  }, [mergedOrders, productNameByRestProduct, productIdByRestItem, isAll, restaurantNameById]);

  const stats = useMemo(() => {
    const paidOrders = mergedOrders.filter((o) => o.payment_status === "success");
    const revenue = paidOrders.reduce((s, o) => s + Number(o.total ?? 0), 0);
    const purchaseTotal = purchasesFiltered.reduce((s, p) => s + Number(p.total ?? 0), 0);
    const expenseTotal = expensesFiltered.reduce((s, e) => s + Number(e.amount ?? 0), 0);
    const lowStock = rawMaterialsFlat.filter((m) => Number(m.stock) < Number(m.min_stock)).length;
    const activeStaff = staffRows.filter((s) => !s.is_suspend).length;
    const uniqueCustomers = new Set(
      mergedOrders.map((o) => o.customer_name || o.guest_customer_phone || "").filter(Boolean),
    ).size;
    return {
      orderCount: mergedOrders.length,
      revenue,
      purchaseTotal,
      expenseTotal,
      lowStock,
      staffCount: staffRows.length,
      activeStaff,
      uniqueCustomers,
    };
  }, [mergedOrders, purchasesFiltered, expensesFiltered, rawMaterialsFlat, staffRows]);

  const orderStatusPie = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of mergedOrders) {
      counts[o.status] = (counts[o.status] || 0) + 1;
    }
    return Object.entries(counts).map(([name, value]) => ({ name: humanizeKey(name), value }));
  }, [mergedOrders]);

  const paymentStatusPie = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of mergedOrders) {
      counts[o.payment_status] = (counts[o.payment_status] || 0) + 1;
    }
    return Object.entries(counts).map(([name, value]) => ({ name: humanizeKey(name), value }));
  }, [mergedOrders]);

  const orderTypePie = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of mergedOrders) {
      const t = o.order_type || "unknown";
      counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts).map(([name, value]) => ({ name: humanizeKey(name), value }));
  }, [mergedOrders]);

  const staffRolePie = useMemo(() => {
    const active = staffRows.filter((s) => !s.is_suspend);
    const counts: Record<string, number> = {};
    for (const s of active) {
      counts[s.role] = (counts[s.role] || 0) + 1;
    }
    return Object.entries(counts).map(([name, value]) => ({ name: humanizeKey(name), value }));
  }, [staffRows]);

  const expenseCategoryPie = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of expensesFiltered) {
      const c = e.category || "other";
      counts[c] = (counts[c] || 0) + Number(e.amount ?? 0);
    }
    return Object.entries(counts).map(([name, value]) => ({ name: humanizeKey(name), value }));
  }, [expensesFiltered]);

  const txnCategoryPie = useMemo(() => {
    const rows = transactionsScoped.filter((t) => t.payment_status === "success");
    const counts: Record<string, number> = {};
    for (const t of rows) {
      const c = t.category || "other";
      counts[c] = (counts[c] || 0) + Number(t.amount ?? 0);
    }
    return Object.entries(counts).map(([name, value]) => ({ name: humanizeKey(name), value }));
  }, [transactionsScoped]);

  const revenueByMonth = useMemo(() => {
    const byKey = new Map<string, number>();
    for (const o of mergedOrders) {
      if (o.payment_status !== "success") continue;
      const k = monthSortKey(o.created_at);
      if (!k) continue;
      byKey.set(k, (byKey.get(k) || 0) + Number(o.total ?? 0));
    }
    const sorted = [...byKey.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
    return sorted.map(([k, amount]) => ({
      month: new Date(`${k}-01`).toLocaleString("en-IN", { month: "short", year: "2-digit" }),
      amount,
    }));
  }, [mergedOrders]);

  const revenueByRestaurant = useMemo(() => {
    if (!isAll) return [];
    const sums = new Map<number, number>();
    for (const o of mergedOrders) {
      if (o.payment_status !== "success") continue;
      sums.set(o.restaurant, (sums.get(o.restaurant) || 0) + Number(o.total ?? 0));
    }
    return restaurantIds.map((id) => ({
      name: restaurantNameById.get(id) ?? `#${id}`,
      revenue: sums.get(id) || 0,
    }));
  }, [isAll, mergedOrders, restaurantIds, restaurantNameById]);

  const txnFlowLine = useMemo(() => {
    const byKey = new Map<string, { in: number; out: number }>();
    for (const t of transactionsScoped) {
      if (t.payment_status !== "success") continue;
      const k = monthSortKey(t.created_at);
      if (!k) continue;
      const cur = byKey.get(k) || { in: 0, out: 0 };
      const amt = Number(t.amount ?? 0);
      if (t.transaction_type === "in") cur.in += amt;
      else cur.out += amt;
      byKey.set(k, cur);
    }
    const sorted = [...byKey.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
    return sorted.map(([k, v]) => ({
      month: new Date(`${k}-01`).toLocaleString("en-IN", { month: "short", year: "2-digit" }),
      inflow: v.in,
      outflow: v.out,
    }));
  }, [transactionsScoped]);

  const stockChartData = useMemo(
    () =>
      rawMaterialsFlat.slice(0, 16).map((rm) => ({
        name: isAll ? `${rm.restaurant_name?.slice(0, 12) ?? ""} · ${rm.name}`.replace(/^ · /, "") : rm.name,
        stock: Number(rm.stock),
        min_stock: Number(rm.min_stock),
      })),
    [rawMaterialsFlat, isAll],
  );

  const waiterLeaderboard = useMemo(() => {
    const counts = new Map<number, { userId: number; name: string; orders: number }>();
    for (const s of staffRows) {
      if (s.role !== "waiter" || s.is_suspend) continue;
      counts.set(s.user, { userId: s.user, name: s.user_name ?? `User #${s.user}`, orders: 0 });
    }
    for (const o of mergedOrders) {
      const w = o.waiter;
      if (w == null) continue;
      const row = counts.get(w);
      if (row) row.orders += 1;
    }
    return [...counts.values()].sort((a, b) => b.orders - a.orders).slice(0, 12);
  }, [staffRows, mergedOrders]);

  const staffTableRows = useMemo(() => {
    return staffRows.map((s) => {
      const served =
        s.role === "waiter" && !s.is_suspend
          ? mergedOrders.filter((o) => o.waiter === s.user && o.restaurant === s.restaurant).length
          : "—";
      return {
        id: s.id,
        name: s.user_name ?? `User #${s.user}`,
        phone: s.user_phone ?? "—",
        restaurant: s.restaurant_name ?? restaurantNameById.get(s.restaurant) ?? "—",
        role: s.role,
        salary: formatInr(Number(s.salary)),
        served,
        status: s.is_suspend ? "Suspended" : "Active",
      };
    });
  }, [staffRows, mergedOrders, restaurantNameById]);

  const recentOrdersTable = useMemo(() => {
    return [...mergedOrders]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 20)
      .map((o) => ({
        id: o.id,
        when: new Date(o.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
        venue: o.restaurant_name ?? restaurantNameById.get(o.restaurant) ?? "—",
        code: o.order_id,
        total: formatInr(Number(o.total)),
        status: o.status,
        payment: o.payment_status,
        waiter:
          o.waiter != null
            ? (waiterNameByUserId.get(o.waiter) ?? `User #${o.waiter}`)
            : "—",
      }));
  }, [mergedOrders, restaurantNameById, waiterNameByUserId]);

  const onOrderNavigate = useCallback(
    (row: { id: number }) => {
      void navigate({ to: "/owner/orders/$id", params: { id: String(row.id) } });
    },
    [navigate],
  );

  const dataPending =
    ordersLoading ||
    staffPending ||
    (isAll && (productsAllPending || itemsAllPending || rmAllPending || expAllPending));

  const scopeLabel = isAll ? "All restaurants" : restaurantNameById.get(activeRestaurantId!) ?? "Location";

  if (!restaurantIds.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-text-secondary">
        No restaurants are linked to this owner account yet.
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div>
          <h2 className="font-display font-semibold text-lg text-foreground">Reports & Analytics</h2>
          <p className="text-sm text-text-secondary mt-1">
            Detailed operational and financial metrics{isAll ? " across every venue you own" : ` for ${scopeLabel}`}.
            Staff assignments follow the{" "}
            <span className="text-foreground font-medium">Restaurant → Staff → User</span> model; waiter performance
            uses the <span className="text-foreground font-medium">Order.waiter</span> link to the same user record.
          </p>
        </div>
      </div>

      {restaurantIds.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            type="button"
            onClick={() => setScope("all")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              isAll ? "border-primary bg-primary-50 text-primary" : "border-border bg-card text-text-secondary hover:bg-surface",
            )}
          >
            <Building2 size={16} />
            All
          </button>
          {restaurantIds.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setScope(id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors max-w-[220px] truncate",
                scope === id ? "border-primary bg-primary-50 text-primary" : "border-border bg-card text-text-secondary hover:bg-surface",
              )}
            >
              {restaurantNameById.get(id) ?? `Restaurant #${id}`}
            </button>
          ))}
        </div>
      )}

      {dataPending ? (
        <p className="text-sm text-text-muted mb-4">Loading report data…</p>
      ) : null}

      <StatCardsGrid className="mb-6">
        <StatCard icon={ShoppingBag} label="Orders (scope)" value={stats.orderCount} />
        <StatCard icon={TrendingUp} label="Recorded revenue" value={formatInr(stats.revenue)} />
        <StatCard icon={Users} label="Staff (rows)" value={`${stats.activeStaff} active / ${stats.staffCount} total`} />
        <StatCard icon={PieChartIcon} label="Tracked customers" value={stats.uniqueCustomers} />
        <StatCard icon={Receipt} label="Purchases (total)" value={formatInr(stats.purchaseTotal)} />
        <StatCard icon={Wallet} label="Expenses (total)" value={formatInr(stats.expenseTotal)} />
        <StatCard icon={Package} label="Low stock SKUs" value={stats.lowStock} />
        <StatCard icon={BarChart3} label="Register lines" value={transactionsScoped.length} />
      </StatCardsGrid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <ChartCard title="Order status mix">
          <PieChartWrap data={orderStatusPie} valueLabel="Orders" />
        </ChartCard>
        <ChartCard title="Payment status mix">
          <PieChartWrap data={paymentStatusPie} valueLabel="Orders" />
        </ChartCard>
        <ChartCard title="Order channel / type">
          <PieChartWrap data={orderTypePie} valueLabel="Orders" />
        </ChartCard>
        <ChartCard title="Active staff roles">
          <PieChartWrap data={staffRolePie} valueLabel="People" />
        </ChartCard>
        <ChartCard title="Expense totals by category">
          <PieChartWrap data={expenseCategoryPie} valueLabel="Amount" formatValue />
        </ChartCard>
        <ChartCard title="Successful transactions by category">
          <PieChartWrap data={txnCategoryPie} valueLabel="Amount" formatValue />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <ChartCard title="Revenue from paid orders (by month)">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={revenueByMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke={Colors.border} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke={Colors.textMuted} />
              <YAxis tick={{ fontSize: 11 }} stroke={Colors.textMuted} />
              <Tooltip formatter={(v: number | string) => formatInr(Number(v))} />
              <Line type="monotone" dataKey="amount" name="Revenue" stroke={Colors.primary500} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Register inflow vs outflow (successful, by month)">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={txnFlowLine}>
              <CartesianGrid strokeDasharray="3 3" stroke={Colors.border} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke={Colors.textMuted} />
              <YAxis tick={{ fontSize: 11 }} stroke={Colors.textMuted} />
              <Tooltip formatter={(v: number | string) => formatInr(Number(v))} />
              <Legend />
              <Line type="monotone" dataKey="inflow" name="In" stroke={Colors.chart4} strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="outflow" name="Out" stroke={Colors.chart1} strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        {isAll && revenueByRestaurant.length > 0 ? (
          <ChartCard title="Paid order revenue by restaurant" className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={revenueByRestaurant}>
                <CartesianGrid strokeDasharray="3 3" stroke={Colors.border} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke={Colors.textMuted} />
                <YAxis tick={{ fontSize: 11 }} stroke={Colors.textMuted} />
                <Tooltip formatter={(v: number | string) => formatInr(Number(v))} />
                <Bar dataKey="revenue" fill={Colors.chart3} radius={[6, 6, 0, 0]} name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : null}
        <ChartCard title="Top products by quantity sold">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={topProducts} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={Colors.border} />
              <XAxis type="number" tick={{ fontSize: 11 }} stroke={Colors.textMuted} />
              <YAxis type="category" dataKey="name" width={isAll ? 140 : 100} tick={{ fontSize: 10 }} stroke={Colors.textMuted} />
              <Tooltip />
              <Bar dataKey="qty" fill={Colors.primary500} radius={[0, 6, 6, 0]} name="Qty" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Inventory vs minimum stock (sample)">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stockChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={Colors.border} />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke={Colors.textMuted} interval={0} angle={-25} textAnchor="end" height={70} />
              <YAxis tick={{ fontSize: 11 }} stroke={Colors.textMuted} />
              <Tooltip />
              <Legend />
              <Bar dataKey="stock" fill={Colors.chart3} name="Stock" radius={[6, 6, 0, 0]} />
              <Bar dataKey="min_stock" fill={Colors.chart5} name="Min" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 mb-6">
        <ChartCard title="Waiter coverage (orders where Order.waiter matches staff user)">
          <ResponsiveContainer width="100%" height={Math.max(220, waiterLeaderboard.length * 36)}>
            <BarChart data={waiterLeaderboard} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={Colors.border} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke={Colors.textMuted} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} stroke={Colors.textMuted} />
              <Tooltip />
              <Bar dataKey="orders" fill={Colors.chart6} radius={[0, 6, 6, 0]} name="Orders" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="space-y-4 mb-6">
        <h3 className="font-display font-semibold text-sm text-foreground">Staff roster (linked restaurants & users)</h3>
        <DataTable
          columns={[
            { header: "Name", accessor: "name" },
            { header: "Phone", accessor: "phone" },
            { header: "Restaurant", accessor: "restaurant" },
            { header: "Role", accessor: (r) => <StatusBadge status={r.role} /> },
            { header: "Salary", accessor: "salary" },
            { header: "Orders served (waiter)", accessor: (r) => (typeof r.served === "number" ? String(r.served) : r.served) },
            { header: "Status", accessor: (r) => <StatusBadge status={r.status === "Active" ? "active" : "inactive"} /> },
          ]}
          data={staffTableRows}
        />
      </div>

      <div className="space-y-4">
        <h3 className="font-display font-semibold text-sm text-foreground">Recent orders</h3>
        <DataTable
          columns={[
            { header: "When", accessor: "when" },
            ...(isAll ? [{ header: "Restaurant", accessor: "venue" as const }] : []),
            { header: "Order", accessor: "code" },
            { header: "Total", accessor: "total" },
            { header: "Status", accessor: (r) => <StatusBadge status={r.status} /> },
            { header: "Payment", accessor: (r) => <StatusBadge status={r.payment} /> },
            { header: "Waiter (User)", accessor: "waiter" },
          ]}
          data={recentOrdersTable}
          onRowClick={onOrderNavigate}
        />
      </div>
    </>
  );
}

function ChartCard({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bg-card rounded-xl border border-border p-4 shadow-sm", className)}>
      <h3 className="font-display font-semibold text-sm text-foreground mb-3">{title}</h3>
      {children}
    </div>
  );
}

function PieChartWrap({
  data,
  valueLabel,
  formatValue,
}: {
  data: { name: string; value: number }[];
  valueLabel: string;
  formatValue?: boolean;
}) {
  if (!data.length) {
    return <p className="text-sm text-text-muted py-8 text-center">No data in this scope.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          dataKey="value"
          data={data}
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={88}
          label={({ name, percent }: { name: string; percent: number }) =>
            `${name} ${(Number(percent) * 100).toFixed(0)}%`
          }
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: number | string) =>
            formatValue ? formatInr(Number(v)) : `${Number(v).toLocaleString("en-IN")} ${valueLabel.toLowerCase()}`
          }
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
