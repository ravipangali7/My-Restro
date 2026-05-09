import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useMemo } from "react";
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
import {
  ArrowLeftRight,
  Bell,
  Building2,
  ChevronRight,
  LayoutDashboard,
  Settings,
  Store,
  TrendingUp,
  UsersRound,
  Wallet,
} from "lucide-react";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useBulkNotifications,
  useRestaurants,
  useSuperSettings,
  useTransactions,
  useUsers,
  useWithdrawals,
} from "@/hooks/use-rest-api";
import type { SuperSettingsDTO } from "@/lib/super-settings-cache";
import { cn } from "@/lib/utils";

const PREVIEW_ROWS = 5;
const CHART_ACCENT = "#4f46e5";

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

function formatInr(n: number): string {
  return `₹${Number(n).toLocaleString()}`;
}

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
  rowCount,
  totalCount,
  children,
}: {
  title: string;
  seeAllTo: string;
  seeAllLabel?: string;
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
          <Link
            to={seeAllTo}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/20 bg-primary-50/90 px-3 py-1 text-xs font-bold text-primary transition-colors hover:border-primary/35 hover:bg-primary-100"
          >
            {seeAllText}
            <ChevronRight className="size-3.5 opacity-80" aria-hidden />
          </Link>
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

type RestaurantRow = {
  id: number;
  name: string;
  phone: string;
  slug: string;
  due_balance: number;
  is_open: boolean;
  subscription_end?: string | null;
};

type UserRow = {
  id: number;
  name: string;
  phone: string;
  role: string;
  is_shareholder: boolean;
  balance: number;
};

type TxRow = {
  id: number;
  restaurant: number;
  amount: number;
  payment_status: string;
  transaction_type: string;
  category: string;
  created_at?: string | null;
};

type WithdrawalRow = {
  id: number;
  user: number;
  amount: number;
  status: string;
  created_at?: string | null;
};

type BulkRow = {
  id: number;
  restaurant: number | null;
  restaurant_name?: string;
  message: string;
  type: string;
  created_at?: string | null;
};

function sortRecentWithdrawals(a: WithdrawalRow, b: WithdrawalRow): number {
  const ta = a.created_at ? Date.parse(String(a.created_at)) : 0;
  const tb = b.created_at ? Date.parse(String(b.created_at)) : 0;
  if (ta !== tb) return tb - ta;
  return b.id - a.id;
}

function sortRecentTx(a: TxRow, b: TxRow): number {
  const ta = a.created_at ? Date.parse(String(a.created_at)) : 0;
  const tb = b.created_at ? Date.parse(String(b.created_at)) : 0;
  if (ta !== tb) return tb - ta;
  return b.id - a.id;
}

function sortRecentBulk(a: BulkRow, b: BulkRow): number {
  const ta = a.created_at ? Date.parse(String(a.created_at)) : 0;
  const tb = b.created_at ? Date.parse(String(b.created_at)) : 0;
  if (ta !== tb) return tb - ta;
  return b.id - a.id;
}

const ROLE_PIE_COLORS: Record<string, string> = {
  owner: "#0d9488",
  staff: "#2563eb",
  customer: "#a855f7",
  super_admin: "#ea580c",
};

export function SuperAdminHomeDashboard() {
  const { data: restaurants, isLoading: lr } = useRestaurants();
  const { data: allUsers, isLoading: lu } = useUsers();
  const { data: shareholderUsers, isLoading: lsh } = useUsers(undefined, true);
  const { data: withdrawals, isLoading: lw } = useWithdrawals();
  const { data: txns, isLoading: lt } = useTransactions(null);
  const { data: bulkList, isLoading: lb } = useBulkNotifications(null);
  const { data: superSettings, isLoading: ls } = useSuperSettings();

  const restList = useMemo(() => (restaurants as RestaurantRow[] | undefined) ?? [], [restaurants]);
  const users = useMemo(() => (allUsers as UserRow[] | undefined) ?? [], [allUsers]);
  const shareholders = useMemo(() => {
    const rows = (shareholderUsers as UserRow[] | undefined) ?? [];
    return rows.filter((u) => u.is_shareholder);
  }, [shareholderUsers]);
  const wdList = useMemo(() => (withdrawals as WithdrawalRow[] | undefined) ?? [], [withdrawals]);
  const txRows = useMemo(() => (txns as TxRow[] | undefined) ?? [], [txns]);
  const bulkRows = useMemo(() => (bulkList as BulkRow[] | undefined) ?? [], [bulkList]);
  const settings = superSettings as SuperSettingsDTO | undefined;

  const activeSubscriptions = useMemo(
    () =>
      restList.filter((r) => {
        const end = r.subscription_end;
        return end && new Date(end) >= new Date();
      }).length,
    [restList],
  );

  const pendingDues = useMemo(() => restList.reduce((s, r) => s + Number(r.due_balance), 0), [restList]);

  const totalInflow = useMemo(
    () => txRows.filter((x) => x.transaction_type === "in").reduce((s, x) => s + Number(x.amount), 0),
    [txRows],
  );

  const pendingWithdrawals = useMemo(() => wdList.filter((w) => w.status === "pending").length, [wdList]);

  const platformBalance = Number(settings?.balance ?? 0);

  const statLoading = lr || lu || lsh || lw || lt || lb || ls;

  const txFlowLast7Days = useMemo(() => {
    const dayMs = 24 * 60 * 60 * 1000;
    const now = new Date();
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now.getTime() - (6 - index) * dayMs);
      const key = date.toISOString().slice(0, 10);
      return {
        key,
        dayLabel: date.toLocaleDateString("en-US", { weekday: "short" }),
        volume: 0,
      };
    });
    const indexByDay = new Map(days.map((item, index) => [item.key, index]));
    for (const t of txRows) {
      if (!t.created_at) continue;
      const dayKey = new Date(String(t.created_at)).toISOString().slice(0, 10);
      const idx = indexByDay.get(dayKey);
      if (idx == null) continue;
      days[idx].volume += Math.abs(Number(t.amount));
    }
    return days;
  }, [txRows]);

  const txTypePie = useMemo(() => {
    let ins = 0;
    let outs = 0;
    for (const t of txRows) {
      if (t.transaction_type === "in") ins += Number(t.amount);
      else if (t.transaction_type === "out") outs += Math.abs(Number(t.amount));
    }
    const parts = [
      { name: "In", value: Math.round(ins) },
      { name: "Out", value: Math.round(outs) },
    ].filter((p) => p.value > 0);
    return parts;
  }, [txRows]);

  const rolePie = useMemo(() => {
    const bucket: Record<string, number> = {};
    for (const u of users) {
      const key = String(u.role ?? "unknown").toLowerCase();
      bucket[key] = (bucket[key] ?? 0) + 1;
    }
    return Object.entries(bucket)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
  }, [users]);

  const moduleVolumeBars = useMemo(
    () => [
      { name: "Restaurants", count: restList.length },
      { name: "Users", count: users.length },
      { name: "Shareholders", count: shareholders.length },
      { name: "Withdrawals", count: wdList.length },
      { name: "Transactions", count: txRows.length },
      { name: "Notifications", count: bulkRows.length },
    ],
    [restList.length, users.length, shareholders.length, wdList.length, txRows.length, bulkRows.length],
  );

  const recentRestaurants = useMemo(() => [...restList].sort((a, b) => b.id - a.id), [restList]);
  const recentUsers = useMemo(() => [...users].sort((a, b) => b.id - a.id), [users]);
  const recentShareholders = useMemo(() => [...shareholders].sort((a, b) => b.id - a.id), [shareholders]);
  const recentWithdrawals = useMemo(() => [...wdList].sort(sortRecentWithdrawals), [wdList]);
  const recentTx = useMemo(() => [...txRows].sort(sortRecentTx), [txRows]);
  const recentBulk = useMemo(() => [...bulkRows].sort(sortRecentBulk), [bulkRows]);

  const userName = (uid: number) => users.find((u) => u.id === uid)?.name ?? `#${uid}`;
  const restName = (rid: number) => restList.find((r) => r.id === rid)?.name ?? `#${rid}`;

  const moduleCards = useMemo(
    () => [
      {
        title: "Restaurants",
        desc: "Locations, billing, and subscription health.",
        to: "/superadmin/restaurants",
        icon: Store,
        stat: `${restList.length} on platform`,
        stripe: "from-teal-500 to-teal-600",
        iconBg: "bg-teal-50 text-teal-700 ring-teal-200/80",
      },
      {
        title: "Users",
        desc: "Owners, staff, customers, and roles.",
        to: "/superadmin/users",
        icon: UsersRound,
        stat: `${users.length} accounts`,
        stripe: "from-blue-500 to-blue-600",
        iconBg: "bg-blue-50 text-blue-700 ring-blue-200/80",
      },
      {
        title: "Shareholders",
        desc: "Equity, balances, and payout posture.",
        to: "/superadmin/shareholders",
        icon: TrendingUp,
        stat: `${shareholders.length} shareholders`,
        stripe: "from-violet-500 to-violet-600",
        iconBg: "bg-violet-50 text-violet-700 ring-violet-200/80",
      },
      {
        title: "Withdrawals",
        desc: "Approve or reject shareholder cash-outs.",
        to: "/superadmin/withdrawals",
        icon: Wallet,
        stat: `${pendingWithdrawals} pending`,
        stripe: "from-amber-500 to-amber-600",
        iconBg: "bg-amber-50 text-amber-800 ring-amber-200/80",
      },
      {
        title: "Transactions",
        desc: "Platform-wide money movement and fees.",
        to: "/superadmin/transactions",
        icon: ArrowLeftRight,
        stat: `${txRows.length} ledger rows`,
        stripe: "from-emerald-500 to-emerald-600",
        iconBg: "bg-emerald-50 text-emerald-800 ring-emerald-200/80",
      },
      {
        title: "Notifications",
        desc: "Bulk SMS and push history across tenants.",
        to: "/superadmin/notifications",
        icon: Bell,
        stat: `${bulkRows.length} campaigns`,
        stripe: "from-sky-500 to-sky-600",
        iconBg: "bg-sky-50 text-sky-800 ring-sky-200/80",
      },
      {
        title: "Settings",
        desc: "Fees, thresholds, and platform defaults.",
        to: "/superadmin/settings",
        icon: Settings,
        stat: "Configure policies",
        stripe: "from-slate-500 to-slate-600",
        iconBg: "bg-slate-100 text-slate-800 ring-slate-200/80",
      },
    ],
    [
      restList.length,
      users.length,
      shareholders.length,
      pendingWithdrawals,
      txRows.length,
      bulkRows.length,
    ],
  );

  return (
    <div className="space-y-8 pb-10">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-primary">
          <LayoutDashboard className="size-5" aria-hidden />
          <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Super admin</p>
        </div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Control center</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-text-secondary">
          Cross-tenant snapshot of every module in the sidebar: KPIs, charts, quick navigation, and five-row previews with
          See All for full lists.
        </p>
      </div>

      <section className="space-y-5">
        <SectionHeader
          eyebrow="Overview"
          title="Platform KPIs"
          description="Headline counts and balances drawn from the same APIs as your list pages."
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6 xl:gap-4">
          <StatFrame accentClass="from-primary/55 via-primary/20 to-transparent">
            <StatCard
              className="h-full rounded-[0.9375rem] border-0 shadow-none"
              icon={Store}
              label="Restaurants"
              value={statLoading ? "…" : String(restList.length)}
            />
          </StatFrame>
          <StatFrame accentClass="from-blue-600/40 via-blue-500/12 to-transparent">
            <StatCard
              className="h-full rounded-[0.9375rem] border-0 shadow-none"
              icon={UsersRound}
              label="Users"
              value={statLoading ? "…" : String(users.length)}
            />
          </StatFrame>
          <StatFrame accentClass="from-violet-500/45 via-violet-400/12 to-transparent">
            <StatCard
              className="h-full rounded-[0.9375rem] border-0 shadow-none"
              icon={TrendingUp}
              label="Shareholders"
              value={statLoading ? "…" : String(shareholders.length)}
            />
          </StatFrame>
          <StatFrame accentClass="from-amber-500/50 via-amber-400/15 to-transparent">
            <StatCard
              className="h-full rounded-[0.9375rem] border-0 shadow-none"
              icon={Wallet}
              label="Pending withdrawals"
              value={statLoading ? "…" : String(pendingWithdrawals)}
            />
          </StatFrame>
          <StatFrame accentClass="from-emerald-500/45 via-emerald-400/12 to-transparent">
            <StatCard
              className="h-full rounded-[0.9375rem] border-0 shadow-none"
              icon={ArrowLeftRight}
              label="Recorded inflows"
              value={statLoading ? "…" : formatInr(totalInflow)}
            />
          </StatFrame>
          <StatFrame accentClass="from-indigo-500/45 via-indigo-400/12 to-transparent">
            <StatCard
              className="h-full rounded-[0.9375rem] border-0 shadow-none"
              icon={Building2}
              label="Platform balance"
              value={statLoading ? "…" : formatInr(platformBalance)}
            />
          </StatFrame>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-border/80 bg-muted/20 px-4 py-3 text-sm text-text-secondary">
            <span className="font-semibold text-foreground">Active subscriptions:</span>{" "}
            {statLoading ? "…" : activeSubscriptions}{" "}
            <span className="text-text-muted">·</span>{" "}
            <span className="font-semibold text-foreground">Outstanding dues (restaurants):</span>{" "}
            {statLoading ? "…" : formatInr(pendingDues)}
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <SectionHeader
          eyebrow="Navigate"
          title="Every sidebar module"
          description="Jump straight into operational pages — counts stay aligned with the previews below."
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
          title="Movement, roles, and volume"
          description="Seven-day transaction cadence, capital direction, user roles, and record counts by module."
        />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Card className="overflow-hidden rounded-2xl border-border/90 shadow-md ring-1 ring-black/[0.02] lg:col-span-2">
            <CardHeader className="space-y-1 border-b border-border/60 bg-muted/20 px-5 pb-4 pt-5">
              <CardTitle className="font-display text-base">Transaction cadence</CardTitle>
              <CardDescription>Absolute movement booked per day — last 7 days.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              <div className="rounded-xl border border-border/70 bg-muted/15 p-2 sm:p-3">
                <ResponsiveContainer width="100%" height={252}>
                  <ComposedChart data={txFlowLast7Days}>
                    <defs>
                      <linearGradient id="superTxArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_ACCENT} stopOpacity={0.22} />
                        <stop offset="88%" stopColor={CHART_ACCENT} stopOpacity={0.02} />
                        <stop offset="100%" stopColor={CHART_ACCENT} stopOpacity={0} />
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
                    <Tooltip
                      {...chartTooltip}
                      formatter={(value: number | string) => [formatInr(Number(value)), "Volume"]}
                    />
                    <Area type="monotone" dataKey="volume" stroke={false} fill="url(#superTxArea)" />
                    <Line
                      type="monotone"
                      dataKey="volume"
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
              <CardTitle className="font-display text-base">Capital direction</CardTitle>
              <CardDescription>Recorded in vs out (rounded ₹).</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col px-5 pb-5 pt-4">
              {txTypePie.length === 0 ? (
                <p className="py-12 text-center text-sm text-text-muted">No transactions to chart yet.</p>
              ) : (
                <>
                  <div className="rounded-xl border border-border/70 bg-muted/15 p-2">
                    <ResponsiveContainer width="100%" height={208}>
                      <PieChart>
                        <Pie
                          data={txTypePie}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={48}
                          outerRadius={76}
                          paddingAngle={2}
                          stroke="var(--card)"
                          strokeWidth={2}
                        >
                          {txTypePie.map((entry) => (
                            <Cell key={entry.name} fill={entry.name === "In" ? "#16a34a" : "#dc2626"} />
                          ))}
                        </Pie>
                        <Tooltip {...chartTooltip} formatter={(v: number | string) => [formatInr(Number(v)), ""]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {txTypePie.map((item) => (
                      <span
                        key={item.name}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-2.5 py-1 text-[11px] font-medium text-text-secondary shadow-sm"
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full shadow-sm"
                          style={{ backgroundColor: item.name === "In" ? "#16a34a" : "#dc2626" }}
                        />
                        {item.name} ({formatInr(item.value)})
                      </span>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-2xl border-border/90 shadow-md ring-1 ring-black/[0.02]">
            <CardHeader className="space-y-1 border-b border-border/60 bg-muted/20 px-5 pb-4 pt-5">
              <CardTitle className="font-display text-base">Users by role</CardTitle>
              <CardDescription>Distribution of accounts on the platform.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col px-5 pb-5 pt-4">
              {rolePie.length === 0 ? (
                <p className="py-12 text-center text-sm text-text-muted">No users to chart yet.</p>
              ) : (
                <>
                  <div className="rounded-xl border border-border/70 bg-muted/15 p-2">
                    <ResponsiveContainer width="100%" height={208}>
                      <PieChart>
                        <Pie
                          data={rolePie}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={48}
                          outerRadius={76}
                          paddingAngle={2}
                          stroke="var(--card)"
                          strokeWidth={2}
                        >
                          {rolePie.map((entry) => (
                            <Cell
                              key={entry.name}
                              fill={
                                ROLE_PIE_COLORS[String(entry.name).replace(/\s/g, "_").toLowerCase()] ?? "#94a3b8"
                              }
                            />
                          ))}
                        </Pie>
                        <Tooltip {...chartTooltip} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {rolePie.map((item) => (
                      <span
                        key={item.name}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-2.5 py-1 text-[11px] font-medium capitalize text-text-secondary shadow-sm"
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full shadow-sm"
                          style={{
                            backgroundColor:
                              ROLE_PIE_COLORS[String(item.name).replace(/\s/g, "_").toLowerCase()] ?? "#94a3b8",
                          }}
                        />
                        {item.name} ({item.value})
                      </span>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-2xl border-border/90 shadow-md ring-1 ring-black/[0.02] lg:col-span-2">
            <CardHeader className="space-y-1 border-b border-border/60 bg-muted/20 px-5 pb-4 pt-5">
              <CardTitle className="font-display text-base">Records by module</CardTitle>
              <CardDescription>How many entities exist in each major area.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              <div className="rounded-xl border border-border/70 bg-muted/15 p-2 sm:p-3">
                <ResponsiveContainer width="100%" height={228}>
                  <BarChart data={moduleVolumeBars}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                    <Tooltip {...chartTooltip} />
                    <Bar dataKey="count" fill={CHART_ACCENT} radius={[6, 6, 0, 0]} />
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
          title="Recent rows (preview)"
          description="Each table shows five records; use See All to open the full module."
        />
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <TableShell
            title="Restaurants"
            seeAllTo="/superadmin/restaurants"
            totalCount={recentRestaurants.length}
            rowCount={Math.min(PREVIEW_ROWS, recentRestaurants.length)}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/80 bg-muted/40 text-left text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2.5 sm:px-5">Name</th>
                  <th className="px-4 py-2.5 sm:px-5">Due</th>
                  <th className="px-4 py-2.5 sm:px-5">Status</th>
                  <th className="px-4 py-2.5 sm:px-5" />
                </tr>
              </thead>
              <tbody>
                {recentRestaurants.slice(0, PREVIEW_ROWS).map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border/60 transition-colors odd:bg-muted/20 last:border-0 hover:bg-primary/[0.04]"
                  >
                    <td className="px-4 py-3 font-medium text-foreground sm:px-5">{r.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-text-secondary sm:px-5">
                      {formatInr(Number(r.due_balance))}
                    </td>
                    <td className="px-4 py-3 sm:px-5">
                      <StatusBadge status={r.is_open ? "open" : "closed"} />
                    </td>
                    <td className="px-4 py-3 text-right sm:px-5">
                      <Link
                        to="/superadmin/restaurants/$id"
                        params={{ id: String(r.id) }}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>

          <TableShell
            title="Users"
            seeAllTo="/superadmin/users"
            totalCount={recentUsers.length}
            rowCount={Math.min(PREVIEW_ROWS, recentUsers.length)}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/80 bg-muted/40 text-left text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2.5 sm:px-5">Name</th>
                  <th className="px-4 py-2.5 sm:px-5">Role</th>
                  <th className="px-4 py-2.5 sm:px-5">Balance</th>
                  <th className="px-4 py-2.5 sm:px-5" />
                </tr>
              </thead>
              <tbody>
                {recentUsers.slice(0, PREVIEW_ROWS).map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-border/60 transition-colors odd:bg-muted/20 last:border-0 hover:bg-primary/[0.04]"
                  >
                    <td className="px-4 py-3 font-medium text-foreground sm:px-5">{u.name}</td>
                    <td className="px-4 py-3 sm:px-5">
                      <span className="capitalize text-text-secondary">{String(u.role).replace(/_/g, " ")}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-text-secondary sm:px-5">
                      {formatInr(Number(u.balance))}
                    </td>
                    <td className="px-4 py-3 text-right sm:px-5">
                      <Link
                        to="/superadmin/users/$id"
                        params={{ id: String(u.id) }}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>

          <TableShell
            title="Shareholders"
            seeAllTo="/superadmin/shareholders"
            totalCount={recentShareholders.length}
            rowCount={Math.min(PREVIEW_ROWS, recentShareholders.length)}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/80 bg-muted/40 text-left text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2.5 sm:px-5">Name</th>
                  <th className="px-4 py-2.5 sm:px-5">Phone</th>
                  <th className="px-4 py-2.5 sm:px-5">Balance</th>
                  <th className="px-4 py-2.5 sm:px-5" />
                </tr>
              </thead>
              <tbody>
                {recentShareholders.slice(0, PREVIEW_ROWS).map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-border/60 transition-colors odd:bg-muted/20 last:border-0 hover:bg-primary/[0.04]"
                  >
                    <td className="px-4 py-3 font-medium text-foreground sm:px-5">{u.name}</td>
                    <td className="px-4 py-3 text-text-secondary sm:px-5">{u.phone}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-text-secondary sm:px-5">
                      {formatInr(Number(u.balance))}
                    </td>
                    <td className="px-4 py-3 text-right sm:px-5">
                      <Link
                        to="/superadmin/users/$id"
                        params={{ id: String(u.id) }}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>

          <TableShell
            title="Withdrawals"
            seeAllTo="/superadmin/withdrawals"
            totalCount={recentWithdrawals.length}
            rowCount={Math.min(PREVIEW_ROWS, recentWithdrawals.length)}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/80 bg-muted/40 text-left text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2.5 sm:px-5">User</th>
                  <th className="px-4 py-2.5 sm:px-5">Amount</th>
                  <th className="px-4 py-2.5 sm:px-5">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentWithdrawals.slice(0, PREVIEW_ROWS).map((w) => (
                  <tr
                    key={w.id}
                    className="border-b border-border/60 transition-colors odd:bg-muted/20 last:border-0 hover:bg-primary/[0.04]"
                  >
                    <td className="px-4 py-3 font-medium text-foreground sm:px-5">{userName(w.user)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-text-secondary sm:px-5">
                      {formatInr(Number(w.amount))}
                    </td>
                    <td className="px-4 py-3 sm:px-5">
                      <StatusBadge status={w.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>

          <TableShell
            title="Transactions"
            seeAllTo="/superadmin/transactions"
            totalCount={recentTx.length}
            rowCount={Math.min(PREVIEW_ROWS, recentTx.length)}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/80 bg-muted/40 text-left text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2.5 sm:px-5">Restaurant</th>
                  <th className="px-4 py-2.5 sm:px-5">Amount</th>
                  <th className="px-4 py-2.5 sm:px-5">Flow</th>
                  <th className="px-4 py-2.5 sm:px-5" />
                </tr>
              </thead>
              <tbody>
                {recentTx.slice(0, PREVIEW_ROWS).map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-border/60 transition-colors odd:bg-muted/20 last:border-0 hover:bg-primary/[0.04]"
                  >
                    <td className="max-w-[140px] truncate px-4 py-3 text-foreground sm:px-5" title={restName(t.restaurant)}>
                      {restName(t.restaurant)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-text-secondary sm:px-5">
                      {formatInr(Number(t.amount))}
                    </td>
                    <td className="px-4 py-3 sm:px-5">
                      <StatusBadge status={t.transaction_type} />
                    </td>
                    <td className="px-4 py-3 text-right sm:px-5">
                      <Link
                        to="/superadmin/transactions/$id"
                        params={{ id: String(t.id) }}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>

          <TableShell
            title="Notifications"
            seeAllTo="/superadmin/notifications"
            totalCount={recentBulk.length}
            rowCount={Math.min(PREVIEW_ROWS, recentBulk.length)}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/80 bg-muted/40 text-left text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2.5 sm:px-5">Restaurant</th>
                  <th className="px-4 py-2.5 sm:px-5">Type</th>
                  <th className="px-4 py-2.5 sm:px-5">Message</th>
                  <th className="px-4 py-2.5 sm:px-5" />
                </tr>
              </thead>
              <tbody>
                {recentBulk.slice(0, PREVIEW_ROWS).map((n) => (
                  <tr
                    key={n.id}
                    className="border-b border-border/60 transition-colors odd:bg-muted/20 last:border-0 hover:bg-primary/[0.04]"
                  >
                    <td
                      className="max-w-[120px] truncate px-4 py-3 text-foreground sm:px-5"
                      title={n.restaurant_name ?? (n.restaurant != null ? restName(n.restaurant) : "Platform")}
                    >
                      {n.restaurant_name ?? (n.restaurant != null ? restName(n.restaurant) : "Platform")}
                    </td>
                    <td className="px-4 py-3 sm:px-5">
                      <StatusBadge status={n.type} />
                    </td>
                    <td className="max-w-[160px] truncate px-4 py-3 text-text-secondary sm:px-5" title={n.message}>
                      {n.message}
                    </td>
                    <td className="px-4 py-3 text-right sm:px-5">
                      <Link
                        to="/superadmin/notifications/$id"
                        params={{ id: String(n.id) }}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>

          <Card className="overflow-hidden rounded-2xl border-border/90 shadow-md ring-1 ring-black/[0.02] xl:col-span-2">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 border-b border-border/60 bg-muted/20 px-5 pb-4 pt-5">
              <div className="space-y-1">
                <CardTitle className="font-display text-base">Platform settings</CardTitle>
                <CardDescription>Live defaults affecting billing, dues, and messaging.</CardDescription>
              </div>
              <Link
                to="/superadmin/settings"
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/20 bg-primary-50/90 px-3 py-1 text-xs font-bold text-primary transition-colors hover:border-primary/35 hover:bg-primary-100"
              >
                Open settings
                <ChevronRight className="size-3.5 opacity-80" aria-hidden />
              </Link>
            </CardHeader>
            <CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-border/70 bg-card/80 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Subscription / mo</p>
                <p className="mt-1 font-display text-lg font-bold text-foreground">
                  {statLoading ? "…" : formatInr(Number(settings?.subscription_fee_per_month ?? 0))}
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-card/80 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Per-txn fee</p>
                <p className="mt-1 font-display text-lg font-bold text-foreground">
                  {statLoading ? "…" : formatInr(Number(settings?.per_transaction_fee ?? 0))}
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-card/80 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Due threshold</p>
                <p className="mt-1 font-display text-lg font-bold text-foreground">
                  {statLoading ? "…" : formatInr(Number(settings?.due_threshold ?? 0))}
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-card/80 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">SMS usage</p>
                <p className="mt-1 font-display text-lg font-bold text-foreground">
                  {statLoading ? "…" : formatInr(Number(settings?.sms_per_usage ?? 0))}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
