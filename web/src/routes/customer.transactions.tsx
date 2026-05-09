import { createFileRoute } from "@tanstack/react-router";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useOrders } from "@/hooks/use-rest-api";
import { restaurantTableColumn } from "@/lib/restaurant-table-column";

export const Route = createFileRoute("/customer/transactions")({
  component: CustomerTransactions,
});

interface OrderRow {
  id: number;
  order_id: string;
  total: string | number;
  payment_status: string;
  status: string;
  created_at: string;
  restaurant?: number;
  restaurant_name?: string;
}

function CustomerTransactions() {
  const { data = [], isLoading, error } = useOrders(null);
  const rows = data as OrderRow[];

  if (error) return <p className="text-sm text-error px-4">Could not load activity.</p>;
  if (isLoading) return <p className="text-sm text-text-muted px-4">Loading…</p>;

  return (
    <div className="px-4 pt-6 pb-8">
      <h1 className="font-display font-bold text-xl text-foreground mb-1">Payments & orders</h1>
      <p className="text-xs text-text-muted mb-4">Your orders from the API (financial ledger per restaurant is owner-facing).</p>
      <DataTable
        columns={[
          { header: "Order", accessor: "order_id" },
          restaurantTableColumn<OrderRow>(),
          { header: "Status", accessor: (o) => <StatusBadge status={o.status} /> },
          { header: "Payment", accessor: (o) => <StatusBadge status={o.payment_status} /> },
          { header: "Total", accessor: (o) => `₹${Number(o.total).toLocaleString()}` },
          { header: "When", accessor: (o) => new Date(o.created_at).toLocaleString() },
        ]}
        data={rows}
      />
    </div>
  );
}
