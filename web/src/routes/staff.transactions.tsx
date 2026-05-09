import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrders, useTransactions } from "@/hooks/use-rest-api";
import { resolvePaidOrderForTransaction, type OrderLinkFields } from "@/lib/transaction-order-link";
import { useAuth } from "@/lib/auth-context";
import { ownerStaffShowsRestaurantColumn, restaurantTableColumn } from "@/lib/restaurant-table-column";
import { useRestaurantScope } from "@/lib/restaurant-context";

export const Route = createFileRoute("/staff/transactions")({ component: StaffTransactions });

type TransactionTab = "all" | "in" | "out" | "pending";

interface TxRow {
  id: number;
  amount: string | number;
  payment_status: string;
  transaction_type: string;
  category: string;
  remarks: string;
  restaurant?: number;
  restaurant_name?: string;
}

function StaffTransactions() {
  const { user } = useAuth();
  const { restaurantId } = useRestaurantScope();
  const showRestaurantCol = ownerStaffShowsRestaurantColumn(user);
  const { data = [], isLoading, error } = useTransactions(restaurantId);
  const { data: orders = [] } = useOrders(restaurantId);
  const rows = data as TxRow[];
  const [tab, setTab] = useState<TransactionTab>("all");

  const filteredRows = useMemo(() => {
    if (tab === "all") return rows;
    if (tab === "in") return rows.filter((t) => String(t.transaction_type).toLowerCase() === "in");
    if (tab === "out") return rows.filter((t) => String(t.transaction_type).toLowerCase() === "out");
    return rows.filter((t) => String(t.payment_status).toLowerCase() === "pending");
  }, [rows, tab]);

  if (restaurantId == null) return <p className="text-sm text-text-muted">No restaurant context.</p>;
  if (error) return <p className="text-sm text-error">Failed to load transactions.</p>;
  if (isLoading) return <p className="text-sm text-text-muted">Loading…</p>;

  return (
    <>
      <h2 className="font-display font-semibold text-lg text-foreground mb-4">Transactions</h2>
      <Tabs value={tab} onValueChange={(v) => setTab(v as TransactionTab)} className="mb-4">
        <TabsList className="w-full max-w-md justify-stretch sm:w-auto">
          <TabsTrigger value="all" className="flex-1 sm:flex-none">
            All
          </TabsTrigger>
          <TabsTrigger value="in" className="flex-1 sm:flex-none">
            In
          </TabsTrigger>
          <TabsTrigger value="out" className="flex-1 sm:flex-none">
            Out
          </TabsTrigger>
          <TabsTrigger value="pending" className="flex-1 sm:flex-none">
            Pending
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <DataTable
        columns={[
          ...(showRestaurantCol ? [restaurantTableColumn<TxRow>()] : []),
          { header: "Amount", accessor: (t) => `₹${Number(t.amount).toLocaleString()}` },
          { header: "Payment", accessor: (t) => <StatusBadge status={t.payment_status} /> },
          { header: "Flow", accessor: (t) => <StatusBadge status={t.transaction_type} /> },
          { header: "Category", accessor: (t) => <StatusBadge status={t.category} /> },
          {
            header: "Related order",
            accessor: (t) => {
              const o = resolvePaidOrderForTransaction(t, orders as OrderLinkFields[]);
              if (!o) return <span className="text-text-muted">—</span>;
              return (
                <div className="flex flex-col gap-1 text-xs">
                  <span className="text-foreground font-medium">{o.order_id}</span>
                  <span className="text-text-secondary">₹{Number(o.total).toLocaleString()}</span>
                  <div className="flex flex-wrap gap-1">
                    <StatusBadge status={o.payment_status} />
                    {o.payment_method ? <StatusBadge status={o.payment_method} /> : null}
                  </div>
                </div>
              );
            },
          },
          { header: "Remarks", accessor: "remarks" },
          {
            header: "Actions",
            accessor: (t) => (
              <Link to="/staff/transactions/$id" params={{ id: String(t.id) }} className="text-xs text-primary font-medium">
                View
              </Link>
            ),
          },
        ]}
        data={filteredRows}
      />
    </>
  );
}
