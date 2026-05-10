import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DataTable } from "@/components/shared/DataTable";
import { useCustomers } from "@/hooks/use-rest-api";
import { useRestaurantScope } from "@/lib/restaurant-context";

export const Route = createFileRoute("/owner/customers")({ component: CustomersPage });

interface CustomerRow {
  id: number;
  name: string;
  phone: string;
}

function CustomersPage() {
  const navigate = useNavigate();
  const { restaurantId } = useRestaurantScope();
  const { data: customers = [], isLoading, error } = useCustomers(restaurantId);

  if (restaurantId == null) {
    return <p className="text-sm text-text-muted">No restaurant selected.</p>;
  }
  if (error) {
    return <p className="text-sm text-error">Could not load customers.</p>;
  }
  if (isLoading) {
    return <p className="text-sm text-text-muted">Loading…</p>;
  }

  return (
    <>
      <h2 className="font-display font-semibold text-lg text-foreground mb-4">Customers</h2>
      <DataTable
        columns={[
          { header: "Name", accessor: "name" },
          { header: "Phone", accessor: "phone" },
        ]}
        data={customers as CustomerRow[]}
        onRowClick={(u) => {
          void navigate({ to: "/owner/customers/$id", params: { id: String(u.id) } });
        }}
      />
    </>
  );
}
