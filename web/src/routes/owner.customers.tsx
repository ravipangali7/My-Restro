import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { OwnerEntityCard, ownerListActionClass } from "@/components/owner/OwnerEntityCard";
import { PaginatedList } from "@/components/shared/PaginatedList";
import { useCustomers } from "@/hooks/use-rest-api";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { Phone, UserRound } from "lucide-react";

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

  const rows = customers as CustomerRow[];

  return (
    <>
      <h2 className="mb-4 font-display text-lg font-semibold text-foreground">Customers</h2>
      <PaginatedList
        items={rows}
        resetDeps={[restaurantId]}
        empty={<p className="text-sm text-text-muted">No customers yet.</p>}
        renderItem={(u, sel) => (
          <OwnerEntityCard
            {...(sel.selectable ? sel : {})}
            onClick={() => {
              void navigate({ to: "/owner/customers/$id", params: { id: String(u.id) } });
            }}
            leading={
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <UserRound strokeWidth={2} aria-hidden />
              </div>
            }
            title={u.name}
            subtitle={
              <span className="inline-flex items-center gap-1.5">
                <Phone size={14} className="shrink-0 text-primary" aria-hidden />
                <span>{u.phone || "—"}</span>
              </span>
            }
            actions={
              <Link
                to="/owner/customers/$id"
                params={{ id: String(u.id) }}
                onClick={(e) => e.stopPropagation()}
                className={ownerListActionClass}
              >
                View customer
              </Link>
            }
          />
        )}
      />
    </>
  );
}
