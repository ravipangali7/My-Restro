import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useOrders } from "@/hooks/use-rest-api";
import { useAuth } from "@/lib/auth-context";
import { ownerStaffShowsRestaurantColumn, restaurantTableColumn } from "@/lib/restaurant-table-column";
import { useRestaurantScope } from "@/lib/restaurant-context";

export const Route = createFileRoute("/owner/orders")({ component: OrdersPage });

interface OrderRow {
  id: number;
  order_id: string;
  order_type: string;
  status: string;
  total: string | number;
  restaurant?: number;
  restaurant_name?: string;
}

function OrdersPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { restaurantId } = useRestaurantScope();
  const { data, isLoading, error } = useOrders(restaurantId, { refetchInterval: 5000 });
  const showRestaurantCol = ownerStaffShowsRestaurantColumn(user);
  const rows = (data ?? []) as OrderRow[];
  const [filter, setFilter] = useState("all");

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((o) => o.status === filter);
  }, [rows, filter]);

  const errMsg = error instanceof Error ? error.message : error ? String(error) : null;

  return (
    <>
      <h2 className="font-display font-semibold text-lg text-foreground mb-4">Orders</h2>
      {errMsg && <p className="text-sm text-error mb-2">{errMsg}</p>}
      {isLoading && <p className="text-sm text-text-muted mb-4">Loading orders…</p>}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {["all", "pending", "accepted", "running", "ready", "waiting_pickup", "delivered", "rejected"].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold capitalize transition-all ${
              filter === f ? "bg-primary text-primary-foreground" : "bg-surface-alt text-text-secondary hover:bg-primary-50"
            }`}
          >
            {f === "all" ? "All" : f.replace(/_/g, " ")}
          </button>
        ))}
      </div>
      <DataTable
        columns={[
          { header: "Order", accessor: "order_id" },
          ...(showRestaurantCol ? [restaurantTableColumn<OrderRow>()] : []),
          { header: "Type", accessor: (o) => <StatusBadge status={o.order_type} /> },
          { header: "Status", accessor: (o) => <StatusBadge status={o.status} /> },
          { header: "Total", accessor: (o) => `₹${Number(o.total).toLocaleString()}` },
        ]}
        data={filtered}
        onRowClick={(o) => {
          void navigate({ to: "/owner/orders/$id", params: { id: String(o.id) } });
        }}
      />
    </>
  );
}
