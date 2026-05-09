import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useRestaurants, useTransactions } from "@/hooks/use-rest-api";

export const Route = createFileRoute("/superadmin/transactions")({ component: TransactionsPage });

function TransactionsPage() {
  const { data: txns, isLoading } = useTransactions(null);
  const { data: restaurants } = useRestaurants();

  const [filter, setFilter] = useState<"all" | "in" | "out">("all");

  const filtered = useMemo(() => {
    const list = (txns as { transaction_type: string }[] | undefined) ?? [];
    return filter === "all" ? list : list.filter((t) => t.transaction_type === filter);
  }, [txns, filter]);

  const restName = (rid: number) =>
    (restaurants as { id: number; name: string }[] | undefined)?.find((r) => r.id === rid)?.name ?? "—";

  const perTxnFee = (t: { effective_per_transaction_fee?: string | number }) => {
    const v = t.effective_per_transaction_fee;
    if (v === undefined || v === null) return "—";
    return `₹${Number(v).toLocaleString()}`;
  };

  if (isLoading) {
    return <p className="text-sm text-text-muted">Loading…</p>;
  }

  return (
    <>
      <h2 className="font-display font-semibold text-lg text-foreground mb-4">Platform Transactions</h2>
      <div className="flex gap-2 mb-4">
        {(["all", "in", "out"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold capitalize transition-all ${
              filter === t ? "bg-primary text-primary-foreground" : "bg-surface-alt text-text-secondary hover:bg-primary-50"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <DataTable
        columns={[
          { header: "Restaurant", accessor: (t) => restName((t as { restaurant: number }).restaurant) },
          { header: "Per-txn fee", accessor: (t) => perTxnFee(t as { effective_per_transaction_fee?: string | number }) },
          { header: "Amount", accessor: (t) => `₹${Number((t as { amount: number }).amount).toLocaleString()}` },
          { header: "Status", accessor: (t) => <StatusBadge status={(t as { payment_status: string }).payment_status} /> },
          { header: "Type", accessor: (t) => <StatusBadge status={(t as { transaction_type: string }).transaction_type} /> },
          {
            header: "Category",
            accessor: (t) => (
              <span className="capitalize text-sm">{String((t as { category: string }).category).replace(/_/g, " ")}</span>
            ),
          },
          { header: "Remarks", accessor: (t) => (t as { remarks?: string }).remarks ?? "" },
          {
            header: "System",
            accessor: (t) =>
              (t as { is_system: boolean }).is_system ? (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-info/10 text-info">System</span>
              ) : (
                <span className="text-xs text-text-muted">Manual</span>
              ),
          },
          {
            header: "Actions",
            accessor: (t) => (
              <Link
                to="/superadmin/transactions/$id"
                params={{ id: String((t as { id: number }).id) }}
                className="px-2 py-1 text-xs rounded-lg bg-primary-50 text-primary font-medium hover:bg-primary-100"
              >
                View
              </Link>
            ),
          },
        ]}
        data={filtered}
      />
    </>
  );
}
