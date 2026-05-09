import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { useCustomers, useOrders } from "@/hooks/use-rest-api";
import { resolveMediaUrl } from "@/lib/api";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { User } from "lucide-react";

export const Route = createFileRoute("/owner/customers")({ component: CustomersPage });

interface OrderRow {
  id: number;
  customer: number | null;
}

interface CustomerRow {
  id: number;
  name: string;
  phone: string;
  image?: string | null;
}

function CustomersPage() {
  const { restaurantId } = useRestaurantScope();
  const { data: customers = [], isLoading, error } = useCustomers(restaurantId);
  const { data: orders = [] } = useOrders(restaurantId);

  const orderCountByCustomer = useMemo(() => {
    const m = new Map<number, number>();
    for (const o of orders as OrderRow[]) {
      if (o.customer == null) continue;
      m.set(o.customer, (m.get(o.customer) ?? 0) + 1);
    }
    return m;
  }, [orders]);

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
          {
            header: "Photo",
            className: "w-24",
            accessor: (u: CustomerRow) => {
              const url = resolveMediaUrl(u.image);
              if (!url) {
                return (
                  <div
                    className="flex size-10 items-center justify-center rounded-full border border-dashed border-border bg-surface text-text-muted"
                    role="img"
                    aria-label="No profile photo"
                  >
                    <User size={18} aria-hidden />
                  </div>
                );
              }
              return (
                <img
                  src={url}
                  alt=""
                  className="size-10 rounded-full border border-border object-cover"
                  loading="lazy"
                />
              );
            },
          },
          { header: "Name", accessor: "name" },
          { header: "Phone", accessor: "phone" },
          {
            header: "Orders",
            accessor: (u: CustomerRow) => String(orderCountByCustomer.get(u.id) ?? 0),
          },
          {
            header: "Actions",
            accessor: (u: CustomerRow) => (
              <Link
                to="/owner/customers/$id"
                params={{ id: String(u.id) }}
                className="text-xs text-primary font-medium"
                onClick={(e) => e.stopPropagation()}
              >
                View
              </Link>
            ),
          },
        ]}
        data={customers as CustomerRow[]}
      />
    </>
  );
}
