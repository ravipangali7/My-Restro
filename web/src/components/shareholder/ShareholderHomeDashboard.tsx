import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  ArrowLeftRight,
  ChevronRight,
  LayoutDashboard,
  PieChart as PieChartIcon,
  Sparkles,
  TrendingUp,
  User,
  Wallet,
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
import type { AuthUser } from "@/lib/auth-context";
import { useAuth } from "@/lib/auth-context";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTransactions, useWithdrawals } from "@/hooks/use-rest-api";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { cn } from "@/lib/utils";

const PREVIEW_ROWS = 5;
const CHART_ACCENT = "#7c3aed";

const SHAREHOLDER_PATH = {
  home: "/shareholder",
  withdrawals: "/shareholder/withdrawals",
  transactions: "/shareholder/transactions",
  profile: "/shareholder/profile",
} as const;

const SHAREHOLDER_SELF_CATEGORIES = new Set([
  "share_withdrawal",
  "share_distribution",
  "share_balance_adjustment",
]);

function isPlatformTransactionViewer(user: AuthUser | null) {
  if (!user) return false;
  return user.role === "super_admin" || user.portal_role === "superadmin";
}

function formatInr(n: number): string {
  return `₹${Number(n).toLocaleString()}`;
}

function formatSharePct(pct: string | undefined): string {
  const n = Number(pct ?? 0);
  if (!Number.isFinite(n)) return "—";
  const text = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
  return `${text}%`;
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
  rowCount,
  totalCount,
  children,
  emptyWhenNoRows,
}: {
  title: string;
  seeAllTo?: string;
  seeAllLabel?: string;
  rowCount: number;
  totalCount: number;
  children: ReactNode;
  emptyWhenNoRows?: ReactNode;
}) {
  const showSeeAll = totalCount > PREVIEW_ROWS;
  const seeAllText = seeAllLabel ?? "See All";

  return (
    <div className="overflow-hidden rounded-2xl border border-border/90 bg-card shadow-sm ring-1 ring-black/[0.02] transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between gap-3 border-b border-border/80 bg-gradient-to-r from-muted/40 via-transparent to-primary-50/20 px-4 py-3.5 sm:px-5">
        <h3 className="font-display text-sm font-bold tracking-tight text-foreground">{title}</h3>
        {showSeeAll && seeAllTo ? (
          <Link
            to={seeAllTo}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/20 bg-primary-50/90 px-3 py-1 text-xs font-bold text-primary transition-colors hover:bg-primary-100 hover:border-primary/35"
          >
            {seeAllText}
            <ChevronRight className="size-3.5 opacity-80" aria-hidden />
          </Link>
        ) : null}
      </div>
      {rowCount === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-text-muted">
          {emptyWhenNoRows ?? <p>No records yet.</p>}
        </div>
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

interface WithdrawalRow {
  id: number;
  user: number;
  amount: string | number;
  status: string;
  remarks: string;
  created_at?: string;
}

interface TxRow {
  id: number;
  restaurant?: number;
  amount: string | number;
  payment_status: string;
  transaction_type: string;
  category: string;
  remarks?: string;
  created_at?: string | null;
  is_system?: boolean;
}

export function ShareholderHomeDashboard() {
  const { user, userName } = useAuth();
  const { restaurantId } = useRestaurantScope();

  const listAll = isPlatformTransactionViewer(user);
  const txnRestaurantId = listAll ? null : restaurantId;
  const canLoadTx = listAll || restaurantId != null;

  const { data: withdrawals = [], isLoading: loadingWd } = useWithdrawals();
  const { data: transactions = [], isLoading: loadingTx } = useTransactions(txnRestaurantId);

  const myWithdrawals = useMemo(() => {
    const rows = withdrawals as WithdrawalRow[];
    if (!user) return [];
    return rows.filter((w) => w.user === user.id);
  }, [withdrawals, user]);

  const txRows = (canLoadTx ? (transactions as TxRow[]) : []) as TxRow[];

  const sortedWithdrawals = useMemo(() => {
    return [...myWithdrawals].sort((a, b) => {
      const ta = a.created_at ? Date.parse(String(a.created_at)) : 0;
      const tb = b.created_at ? Date.parse(String(b.created_at)) : 0;
      if (tb !== ta) return tb - ta;
      return b.id - a.id;
    });
  }, [myWithdrawals]);

  const sortedTx = useMemo(() => {
    return [...txRows].sort((a, b) => {
      const ta = a.created_at ? Date.parse(String(a.created_at)) : 0;
      const tb = b.created_at ? Date.parse(String(b.created_at)) : 0;
      if (tb !== ta) return tb - ta;
      return b.id - a.id;
    });
  }, [txRows]);

  const selfTx = useMemo(
    () => sortedTx.filter((t) => SHAREHOLDER_SELF_CATEGORIES.has(String(t.category))),
    [sortedTx],
  );

  const pendingWd = useMemo(() => myWithdrawals.filter((w) => w.status === "pending").length, [myWithdrawals]);
  const approvedWd = useMemo(() => myWithdrawals.filter((w) => w.status === "approved").length, [myWithdrawals]);

  const payoutFlow7d = useMemo(() => {
    const dayMs = 24 * 60 * 60 * 1000;
    const now = new Date();
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now.getTime() - (6 - index) * dayMs);
      return {
        key: date.toISOString().slice(0, 10),
        dayLabel: date.toLocaleDateString("en-US", { weekday: "short" }),
        net: 0,
      };
    });
    const indexByDay = new Map(days.map((d, i) => [d.key, i]));
    for (const t of selfTx) {
      if (!t.created_at) continue;
      const dayKey = new Date(t.created_at).toISOString().slice(0, 10);
      const idx = indexByDay.get(dayKey);
      if (idx == null) continue;
      const amt = Number(t.amount);
      const typ = String(t.transaction_type).toLowerCase();
      if (typ === "in") days[idx].net += amt;
      else if (typ === "out") days[idx].net -= amt;
    }
    return days;
  }, [selfTx]);

  const withdrawalStatusPie = useMemo(() => {
    const bucket: Record<string, number> = { pending: 0, approved: 0, rejected: 0, other: 0 };
    for (const w of myWithdrawals) {
      const k = String(w.status ?? "").toLowerCase();
      if (k in bucket) bucket[k] += 1;
      else bucket.other += 1;
    }
    return Object.entries(bucket)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [myWithdrawals]);

  const wdColors: Record<string, string> = {
    pending: "#f59e0b",
    approved: "#16a34a",
    rejected: "#ef4444",
    other: "#64748b",
  };

  const flowBars = useMemo(() => {
    let ins = 0;
    let outs = 0;
    for (const t of sortedTx) {
      const typ = String(t.transaction_type).toLowerCase();
      if (typ === "in") ins += 1;
      else if (typ === "out") outs += 1;
    }
    return [
      { name: "In", count: ins },
      { name: "Out", count: outs },
    ];
  }, [sortedTx]);

  const moduleVolumeBars = useMemo(
    () => [
      { name: "Dashboard", count: 1 },
      { name: "Withdrawals", count: myWithdrawals.length },
      { name: "Transactions", count: canLoadTx ? sortedTx.length : 0 },
      { name: "Profile", count: user ? 1 : 0 },
    ],
    [myWithdrawals.length, sortedTx.length, canLoadTx, user],
  );

  const flow7dExtremes = useMemo(() => payoutFlow7d.reduce((s, d) => s + Math.abs(d.net), 0), [payoutFlow7d]);

  const statLoading = loadingWd || (canLoadTx && loadingTx);

  const balanceNum = user ? Number(user.balance) : NaN;
  const dueNum = user ? Number(user.due_balance) : NaN;

  const moduleCards = [
    {
      title: "Dashboard",
      desc: "Overview & analytics",
      to: SHAREHOLDER_PATH.home,
      icon: LayoutDashboard,
      stat: user ? formatInr(balanceNum) : "—",
      stripe: "from-slate-400 to-slate-600",
      iconBg: "bg-slate-100 text-slate-700 ring-slate-200/80",
    },
    {
      title: "Withdrawals",
      desc: "Request & track payouts",
      to: SHAREHOLDER_PATH.withdrawals,
      icon: Wallet,
      stat: `${myWithdrawals.length} request${myWithdrawals.length === 1 ? "" : "s"}`,
      stripe: "from-amber-400 to-amber-600",
      iconBg: "bg-amber-50 text-amber-900 ring-amber-200/80",
    },
    {
      title: "Transactions",
      desc: "Distributions & activity",
      to: SHAREHOLDER_PATH.transactions,
      icon: ArrowLeftRight,
      stat: canLoadTx ? `${sortedTx.length} loaded` : "Link a restaurant to load",
      stripe: "from-blue-500 to-indigo-600",
      iconBg: "bg-blue-50 text-blue-800 ring-blue-200/70",
    },
    {
      title: "Profile",
      desc: "Identity & shareholding",
      to: SHAREHOLDER_PATH.profile,
      icon: User,
      stat: user ? formatSharePct(user.share_percentage) : "—",
      stripe: "from-violet-400 to-violet-700",
      iconBg: "bg-violet-50 text-violet-900 ring-violet-200/70",
    },
  ] as const;

  const flowBarFills = ["var(--chart-2)", "var(--chart-5)"];
  const moduleBarFills = ["var(--chart-1)", "var(--chart-4)", "var(--chart-3)", "var(--chart-6)"];

  const profilePreviewRows: { label: string; value: string }[] = user
    ? [
        { label: "Name", value: user.name },
        { label: "Phone", value: user.phone || "—" },
        { label: "Share", value: formatSharePct(user.share_percentage) },
        { label: "Balance", value: formatInr(balanceNum) },
        { label: "Due", value: formatInr(dueNum) },
      ]
    : [];

  return (
    <div className="space-y-10 pb-2">
      <div className="relative overflow-hidden rounded-2xl border border-border/90 bg-gradient-to-br from-violet-50/90 via-card to-muted/40 p-5 shadow-md ring-1 ring-violet-500/10 sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-24 size-56 rounded-full bg-violet-500/[0.08] blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 size-40 rounded-full bg-primary/10 blur-2xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-600/30">
              <Sparkles className="size-6" strokeWidth={1.75} aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Hello, {userName}</h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-text-secondary">
                Portfolio snapshot: balances, withdrawal pipeline, payout flow, and quick access to every area in your
                shareholder portal.
              </p>
            </div>
          </div>
          {statLoading ? (
            <div className="flex shrink-0 items-center gap-2 self-start rounded-full border border-border/80 bg-card/90 px-4 py-2 text-xs font-semibold text-text-secondary shadow-sm backdrop-blur-sm lg:self-center">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-500/50" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-violet-600" />
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
          title="Holdings at a glance"
          description="Balances, withdrawal queue, and loaded financial activity for your account."
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6 xl:gap-4">
          <StatFrame accentClass="from-violet-500/55 via-violet-400/20 to-transparent">
            <StatCard
              className="h-full rounded-[0.9375rem] border-0 shadow-none"
              icon={Wallet}
              label="Balance"
              value={statLoading || !user ? "…" : formatInr(balanceNum)}
            />
          </StatFrame>
          <StatFrame accentClass="from-rose-500/45 via-rose-400/12 to-transparent">
            <StatCard
              className="h-full rounded-[0.9375rem] border-0 shadow-none"
              icon={TrendingUp}
              label="Due balance"
              value={statLoading || !user ? "…" : formatInr(dueNum)}
            />
          </StatFrame>
          <StatFrame accentClass="from-amber-500/45 via-amber-400/12 to-transparent">
            <StatCard
              className="h-full rounded-[0.9375rem] border-0 shadow-none"
              icon={Wallet}
              label="Pending withdrawals"
              value={statLoading ? "…" : String(pendingWd)}
            />
          </StatFrame>
          <StatFrame accentClass="from-emerald-500/45 via-emerald-400/12 to-transparent">
            <StatCard
              className="h-full rounded-[0.9375rem] border-0 shadow-none"
              icon={PieChartIcon}
              label="Approved withdrawals"
              value={statLoading ? "…" : String(approvedWd)}
            />
          </StatFrame>
          <StatFrame accentClass="from-blue-600/40 via-blue-500/12 to-transparent">
            <StatCard
              className="h-full rounded-[0.9375rem] border-0 shadow-none"
              icon={ArrowLeftRight}
              label="Transactions"
              value={!canLoadTx ? "—" : statLoading ? "…" : String(sortedTx.length)}
            />
          </StatFrame>
          <StatFrame accentClass="from-indigo-500/45 via-indigo-400/12 to-transparent">
            <StatCard
              className="h-full rounded-[0.9375rem] border-0 shadow-none"
              icon={User}
              label="Share"
              value={statLoading || !user ? "…" : formatSharePct(user.share_percentage)}
            />
          </StatFrame>
        </div>
      </section>

      <section className="space-y-5">
        <SectionHeader
          eyebrow="Navigate"
          title="Workspace"
          description="Each card mirrors a sidebar destination — open the module to take action."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
          description="Payout flow, withdrawal outcomes, transaction direction mix, and activity by module."
        />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Card className="overflow-hidden rounded-2xl border-border/90 shadow-md ring-1 ring-black/[0.02] lg:col-span-2">
            <CardHeader className="space-y-1 border-b border-border/60 bg-muted/20 px-5 pb-4 pt-5">
              <CardTitle className="font-display text-base">Shareholder payout flow</CardTitle>
              <CardDescription>
                Net in minus out (₹) per day from distribution & withdrawal categories — last 7 days.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              {!canLoadTx ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-text-muted">
                  Link a restaurant or use a platform seat to load transactions for this chart.
                </p>
              ) : (
                <div className="rounded-xl border border-border/70 bg-muted/15 p-2 sm:p-3">
                  <ResponsiveContainer width="100%" height={252}>
                    <ComposedChart data={payoutFlow7d}>
                      <defs>
                        <linearGradient id="shPayoutArea" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={CHART_ACCENT} stopOpacity={0.22} />
                          <stop offset="88%" stopColor={CHART_ACCENT} stopOpacity={0.02} />
                          <stop offset="100%" stopColor={CHART_ACCENT} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="dayLabel" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} width={56} axisLine={false} tickLine={false} />
                      <Tooltip
                        {...chartTooltip}
                        formatter={(value: number | string) => [formatInr(Number(value)), "Net"]}
                      />
                      <Area type="monotone" dataKey="net" stroke={false} fill="url(#shPayoutArea)" />
                      <Line
                        type="monotone"
                        dataKey="net"
                        stroke={CHART_ACCENT}
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: "var(--card)", stroke: CHART_ACCENT, strokeWidth: 2 }}
                        activeDot={{ r: 6 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
              {canLoadTx && !statLoading && flow7dExtremes === 0 && selfTx.length === 0 ? (
                <p className="mt-3 text-center text-xs text-text-muted">No shareholder-category movements in the last week.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-2xl border-border/90 shadow-md ring-1 ring-black/[0.02]">
            <CardHeader className="space-y-1 border-b border-border/60 bg-muted/20 px-5 pb-4 pt-5">
              <CardTitle className="font-display text-base">Withdrawal status</CardTitle>
              <CardDescription>Share of your requests by outcome.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col px-5 pb-5 pt-4">
              {withdrawalStatusPie.length === 0 ? (
                <p className="py-12 text-center text-sm text-text-muted">No withdrawal requests yet.</p>
              ) : (
                <>
                  <div className="rounded-xl border border-border/70 bg-muted/15 p-2">
                    <ResponsiveContainer width="100%" height={208}>
                      <PieChart>
                        <Pie
                          data={withdrawalStatusPie}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={48}
                          outerRadius={76}
                          paddingAngle={2}
                          stroke="var(--card)"
                          strokeWidth={2}
                        >
                          {withdrawalStatusPie.map((entry) => (
                            <Cell key={entry.name} fill={wdColors[entry.name] ?? "#94a3b8"} />
                          ))}
                        </Pie>
                        <Tooltip {...chartTooltip} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {withdrawalStatusPie.map((item) => (
                      <span
                        key={item.name}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-2.5 py-1 text-[11px] font-medium capitalize text-text-secondary shadow-sm"
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full shadow-sm"
                          style={{ backgroundColor: wdColors[item.name] ?? "#94a3b8" }}
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
              <CardTitle className="font-display text-base">Transactions by direction</CardTitle>
              <CardDescription>In vs out counts from your loaded ledger.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              {!canLoadTx ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-text-muted">
                  Restaurant or platform scope is required to chart transactions.
                </p>
              ) : (
                <div className="rounded-xl border border-border/70 bg-muted/15 p-2 sm:p-3">
                  <ResponsiveContainer width="100%" height={228}>
                    <BarChart data={flowBars}>
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
                        {flowBars.map((_, i) => (
                          <Cell key={`flow-${i}`} fill={flowBarFills[i % flowBarFills.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
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
                      width={88}
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
          description="Five-row previews — open the full module when you need every record."
        />
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <TableShell
            title="Withdrawals"
            seeAllTo={SHAREHOLDER_PATH.withdrawals}
            totalCount={sortedWithdrawals.length}
            rowCount={Math.min(PREVIEW_ROWS, sortedWithdrawals.length)}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/80 bg-muted/40 text-left text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2.5 sm:px-5">Requested</th>
                  <th className="px-4 py-2.5 sm:px-5">Amount</th>
                  <th className="px-4 py-2.5 sm:px-5">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedWithdrawals.slice(0, PREVIEW_ROWS).map((w) => (
                  <tr
                    key={w.id}
                    className="border-b border-border/60 transition-colors odd:bg-muted/20 last:border-0 hover:bg-primary/[0.04]"
                  >
                    <td className="px-4 py-3 text-text-secondary sm:px-5">
                      {w.created_at ? new Date(w.created_at).toLocaleString() : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground sm:px-5">
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
            seeAllTo={canLoadTx ? SHAREHOLDER_PATH.transactions : undefined}
            totalCount={sortedTx.length}
            rowCount={canLoadTx ? Math.min(PREVIEW_ROWS, sortedTx.length) : 0}
            emptyWhenNoRows={
              !canLoadTx ? (
                <p>
                  Select a restaurant (owner) or use a platform admin seat to preview transactions here. You can still open
                  the Transactions page for guidance.
                </p>
              ) : undefined
            }
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/80 bg-muted/40 text-left text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2.5 sm:px-5">When</th>
                  <th className="px-4 py-2.5 sm:px-5">Amount</th>
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
                    <td className="px-4 py-3 text-text-secondary sm:px-5">
                      {t.created_at ? new Date(t.created_at).toLocaleString() : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-foreground sm:px-5">{formatInr(Number(t.amount))}</td>
                    <td className="px-4 py-3 sm:px-5">
                      <StatusBadge status={t.transaction_type} />
                    </td>
                    <td className="px-4 py-3 sm:px-5">
                      <span className="capitalize">{String(t.category).replace(/_/g, " ")}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>

          <TableShell
            title="Profile summary"
            seeAllTo={SHAREHOLDER_PATH.profile}
            totalCount={profilePreviewRows.length}
            rowCount={Math.min(PREVIEW_ROWS, profilePreviewRows.length)}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/80 bg-muted/40 text-left text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2.5 sm:px-5">Field</th>
                  <th className="px-4 py-2.5 sm:px-5">Value</th>
                </tr>
              </thead>
              <tbody>
                {profilePreviewRows.slice(0, PREVIEW_ROWS).map((r) => (
                  <tr
                    key={r.label}
                    className="border-b border-border/60 transition-colors odd:bg-muted/20 last:border-0 hover:bg-primary/[0.04]"
                  >
                    <td className="px-4 py-3 font-medium text-foreground sm:px-5">{r.label}</td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-text-secondary sm:max-w-none sm:px-5" title={r.value}>
                      {r.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        </div>
      </section>
    </div>
  );
}
