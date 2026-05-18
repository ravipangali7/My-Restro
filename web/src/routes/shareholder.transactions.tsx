import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { ListPageShell, PaginatedList } from "@/components/shared/PaginatedList";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Checkbox } from "@/components/ui/checkbox";
import { useRestaurants, useTransactions, useWithdrawals } from "@/hooks/use-rest-api";
import { useAuth } from "@/lib/auth-context";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/shareholder/transactions")({
  component: ShareholderTransactions,
});

const SHAREHOLDER_SELF_CATEGORIES = new Set([
  "share_withdrawal",
  "share_distribution",
  "share_balance_adjustment",
  "due_paid",
]);

function isPlatformTransactionViewer(user: { role: string; portal_role: string } | null) {
  if (!user) return false;
  return user.role === "super_admin" || user.portal_role === "superadmin";
}

type TxnRow = {
  id: number;
  restaurant: number;
  amount: number;
  payment_status: string;
  transaction_type: string;
  category: string;
  remarks?: string;
  is_system: boolean;
  created_at?: string;
  effective_per_transaction_fee?: string | number;
};

type WithdrawalRow = {
  id: number;
  user: number;
  amount: string | number;
  status: string;
  remarks: string;
  created_at?: string;
};

type FlowFilter = "all" | "in" | "out";

function formatWhen(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function categoryLabel(cat: string) {
  return String(cat).replace(/_/g, " ");
}

function ShareholderTransactions() {
  const { user } = useAuth();
  const { restaurantId } = useRestaurantScope();
  const listAll = isPlatformTransactionViewer(user);
  const txnRestaurantId = listAll ? null : restaurantId;

  const { data: txns, isLoading, error } = useTransactions(txnRestaurantId);
  const { data: restaurants } = useRestaurants();
  const { data: withdrawals = [], isLoading: wdLoading } = useWithdrawals();

  const [flowFilter, setFlowFilter] = useState<FlowFilter>("all");

  const canLoad = listAll || restaurantId != null;

  const selfOnly = useMemo(() => {
    const list = (txns as TxnRow[] | undefined) ?? [];
    return list.filter((t) => SHAREHOLDER_SELF_CATEGORIES.has(t.category));
  }, [txns]);

  const myPendingWithdrawals = useMemo(() => {
    const rows = (withdrawals as WithdrawalRow[]) ?? [];
    if (!user) return [];
    return rows.filter((w) => w.user === user.id && String(w.status).toLowerCase() === "pending");
  }, [withdrawals, user]);

  const filtered = useMemo(() => {
    if (flowFilter === "all") return selfOnly;
    return selfOnly.filter((t) => t.transaction_type === flowFilter);
  }, [selfOnly, flowFilter]);

  const restName = (rid: number) =>
    (restaurants as { id: number; name: string }[] | undefined)?.find((r) => r.id === rid)?.name ?? "—";

  const perTxnFee = (t: TxnRow) => {
    const v = t.effective_per_transaction_fee;
    if (v === undefined || v === null) return "—";
    return `₹${Number(v).toLocaleString()}`;
  };

  if (!canLoad) {
    return (
      <div className="space-y-2">
        <h2 className="font-display font-semibold text-lg text-foreground">Transactions</h2>
        <p className="text-sm text-text-muted">
          Restaurant activity is available when your account is linked to a restaurant (for example as an owner).
          Platform-wide history is available for super administrators with a shareholder seat.
        </p>
      </div>
    );
  }

  if (error) return <p className="text-sm text-error">Failed to load transactions.</p>;
  if (isLoading || wdLoading) return <p className="text-sm text-text-muted">Loading…</p>;

  const title = listAll ? "Your platform transactions" : "Your transactions";
  const subtitle = listAll
    ? `Share distributions and withdrawals on your platform account (balance ₹${Number(user?.balance ?? 0).toLocaleString()}).`
    : "Withdrawals, distributions, and related ledger activity for your shareholder account at this restaurant.";

  return (
    <>
      <ListPageShell
        header={
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
              <div>
                <h2 className="font-display font-semibold text-lg text-foreground">{title}</h2>
                <p className="text-[11px] text-text-muted mt-0.5 max-w-prose">{subtitle}</p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                {(["all", "in", "out"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFlowFilter(t)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-[11px] font-semibold capitalize transition-colors",
                      flowFilter === t
                        ? "bg-primary text-primary-foreground"
                        : "bg-surface-alt text-text-secondary hover:bg-accent/50",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {myPendingWithdrawals.length > 0 ? (
              <section className="mb-6">
                <h3 className="font-semibold text-sm text-foreground mb-2">Pending withdrawal requests</h3>
                <p className="text-xs text-text-secondary mb-3">
                  These requests are awaiting review. Your balance is unchanged until a request is approved.
                </p>
                <div className="space-y-2">
                  {myPendingWithdrawals.map((w) => (
                    <div
                      key={w.id}
                      className="rounded-xl border transition-colors bg-primary-50 border-primary/30"
                    >
                      <div className="p-3">
                        <div className="flex items-start justify-between gap-2 min-w-0">
                          <p className="font-semibold text-foreground leading-snug text-sm tabular-nums">
                            ₹{Number(w.amount).toLocaleString()}
                          </p>
                          <StatusBadge status={w.status} />
                        </div>
                        <p className="text-[11px] text-text-muted mt-1">{formatWhen(w.created_at)}</p>
                        <p className="text-xs text-text-secondary mt-1.5 line-clamp-2">
                          {w.remarks?.trim() ? <span className="font-medium text-foreground">Note: </span> : null}
                          {w.remarks?.trim() || "—"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <h3 className="font-semibold text-sm text-foreground mb-3">Ledger transactions</h3>
          </>
        }
      >
        <PaginatedList
          items={filtered}
          resetDeps={[flowFilter]}
          empty={
            <div className="rounded-lg border border-dashed border-border bg-surface-alt/30 p-6 text-center">
              <ArrowLeftRight className="mx-auto text-text-muted mb-2" size={20} aria-hidden />
              <p className="text-sm text-text-muted">No ledger transactions in this view yet.</p>
            </div>
          }
          renderItem={(t, sel) => {
            const n = Number(t.amount);
            const sign = t.transaction_type === "out" ? "−" : t.transaction_type === "in" ? "+" : "";
            const amountLine = `${sign}₹${n.toLocaleString()}`;
            return (
              <div
                className={cn(
                  "rounded-xl border border-border bg-card transition-colors",
                  sel.selectable && sel.selected && "border-primary/40 bg-primary/[0.04] ring-1 ring-primary/20",
                )}
              >
                <div className="flex items-stretch gap-2">
                  {sel.selectable ? (
                    <div
                      className="flex shrink-0 items-start pt-3 pl-2"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={sel.selected}
                        onCheckedChange={(c) => sel.onSelectedChange(c === true)}
                        aria-label="Select transaction"
                      />
                    </div>
                  ) : null}
                  <Link
                    to="/shareholder/transactions/$id"
                    params={{ id: String(t.id) }}
                    className="block min-w-0 flex-1 text-left rounded-xl p-3 hover:bg-accent/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                  >
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <p className="font-semibold text-foreground leading-snug text-sm tabular-nums">{amountLine}</p>
                      <span className="text-[10px] font-medium text-primary shrink-0">View</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <StatusBadge status={t.payment_status} />
                      <StatusBadge status={t.transaction_type} />
                      <span className="text-[10px] uppercase tracking-wide text-text-muted px-1.5 py-0.5 rounded-md bg-surface-alt">
                        {categoryLabel(t.category)}
                      </span>
                    </div>
                    <p className="text-[11px] text-text-muted mt-1">{formatWhen(t.created_at)}</p>
                    <p className="text-xs text-text-secondary mt-1 line-clamp-2">
                      <span className="font-medium text-foreground">{restName(t.restaurant)}</span>
                      <span className="text-text-muted"> · </span>
                      Fee {perTxnFee(t)}
                      {t.remarks?.trim() ? (
                        <>
                          <span className="text-text-muted"> · </span>
                          {t.remarks.trim()}
                        </>
                      ) : null}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      {t.is_system ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-info/10 text-info">
                          System
                        </span>
                      ) : (
                        <span className="text-[10px] text-text-muted">Manual</span>
                      )}
                    </div>
                  </Link>
                </div>
              </div>
            );
          }}
        />
      </ListPageShell>
    </>
  );
}
