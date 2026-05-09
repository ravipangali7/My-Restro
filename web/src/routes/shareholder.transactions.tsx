import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useRestaurants, useTransactions, useWithdrawals } from "@/hooks/use-rest-api";
import { useAuth } from "@/lib/auth-context";
import { useRestaurantScope } from "@/lib/restaurant-context";

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
          Restaurant activity is available when your account is linked to a restaurant (for example as an owner). Platform-wide
          history is available for super administrators with a shareholder seat.
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
      <h2 className="font-display font-semibold text-lg text-foreground mb-1">{title}</h2>
      <p className="text-sm text-text-muted mb-4">{subtitle}</p>

      <div className="flex gap-2 mb-4">
        {(["all", "in", "out"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setFlowFilter(t)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold capitalize transition-all ${
              flowFilter === t ? "bg-primary text-primary-foreground" : "bg-surface-alt text-text-secondary hover:bg-primary-50"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {myPendingWithdrawals.length > 0 && (
        <section className="mb-8">
          <h3 className="font-display font-semibold text-base text-foreground mb-2">Pending withdrawal requests</h3>
          <p className="text-sm text-text-muted mb-3">
            These requests are awaiting review. Your balance is unchanged until a request is approved.
          </p>
          <DataTable
            columns={[
              { header: "Requested", accessor: (w) => (w.created_at ? new Date(w.created_at).toLocaleString() : "—") },
              { header: "Amount", accessor: (w) => `₹${Number(w.amount).toLocaleString()}` },
              { header: "Status", accessor: (w) => <StatusBadge status={w.status} /> },
              { header: "Note", accessor: (w) => w.remarks || "—" },
            ]}
            data={myPendingWithdrawals}
          />
        </section>
      )}

      <section>
        <h3 className="font-display font-semibold text-base text-foreground mb-2">Ledger transactions</h3>
        {filtered.length === 0 ? (
          <p className="text-sm text-text-muted py-8 text-center rounded-xl border border-dashed border-border">
            No ledger transactions in this view yet.
          </p>
        ) : (
          <DataTable
            columns={[
              {
                header: "Date",
                accessor: (t) =>
                  t.created_at ? new Date(t.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—",
              },
              { header: "Restaurant", accessor: (t) => restName(t.restaurant) },
              { header: "Per-txn fee", accessor: (t) => perTxnFee(t) },
              {
                header: "Amount",
                accessor: (t) => {
                  const n = Number(t.amount);
                  const sign = t.transaction_type === "out" ? "−" : t.transaction_type === "in" ? "+" : "";
                  return `${sign}₹${n.toLocaleString()}`;
                },
              },
              { header: "Status", accessor: (t) => <StatusBadge status={t.payment_status} /> },
              { header: "Type", accessor: (t) => <StatusBadge status={t.transaction_type} /> },
              {
                header: "Category",
                accessor: (t) => (
                  <span className="capitalize text-sm">{String(t.category).replace(/_/g, " ")}</span>
                ),
              },
              { header: "Reason", accessor: (t) => t.remarks?.trim() || "—" },
              {
                header: "System",
                accessor: (t) =>
                  t.is_system ? (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-info/10 text-info">System</span>
                  ) : (
                    <span className="text-xs text-text-muted">Manual</span>
                  ),
              },
              {
                header: "Actions",
                accessor: (t) => (
                  <Link
                    to="/shareholder/transactions/$id"
                    params={{ id: String(t.id) }}
                    className="px-2 py-1 text-xs rounded-lg bg-primary-50 text-primary font-medium hover:bg-primary-100"
                  >
                    View
                  </Link>
                ),
              },
            ]}
            data={filtered}
          />
        )}
      </section>
    </>
  );
}
