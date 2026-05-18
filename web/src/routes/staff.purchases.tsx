import { createFileRoute, Link } from "@tanstack/react-router";
import { PaginatedDataTable } from "@/components/shared/PaginatedDataTable";
import { usePurchases } from "@/hooks/use-rest-api";
import { useAuth } from "@/lib/auth-context";
import { ownerStaffShowsRestaurantColumn, restaurantTableColumn } from "@/lib/restaurant-table-column";

export const Route = createFileRoute("/staff/purchases")({ component: StaffPurchases });

interface PurchaseRow {
  id: number;
  purchase_id: string;
  supplier: number | null;
  total: string | number;
  restaurant?: number;
  restaurant_name?: string;
}

function StaffPurchases() {
  const { user } = useAuth();
  const showRestaurantCol = ownerStaffShowsRestaurantColumn(user);
  const { data = [], isLoading, error } = usePurchases();
  const rows = data as PurchaseRow[];

  if (error) return <p className="text-sm text-error">Failed to load purchases.</p>;
  if (isLoading) return <p className="text-sm text-text-muted">Loading…</p>;

  return (
    <>
      <h2 className="font-display font-semibold text-lg text-foreground mb-4">Purchases</h2>
      <PaginatedDataTable
        enableSelection={false}
        columns={[
          { header: "Purchase ID", accessor: "purchase_id" },
          ...(showRestaurantCol ? [restaurantTableColumn<PurchaseRow>()] : []),
          { header: "Supplier", accessor: (p) => (p.supplier != null ? `#${p.supplier}` : "—") },
          { header: "Total", accessor: (p) => `₹${Number(p.total).toLocaleString()}` },
          {
            header: "Actions",
            accessor: (p) => (
              <Link to="/owner/purchases/$id" params={{ id: String(p.id) }} className="text-xs text-primary font-medium">
                View
              </Link>
            ),
          },
        ]}
        data={rows}
      />
    </>
  );
}
