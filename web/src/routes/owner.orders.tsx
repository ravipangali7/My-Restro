import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { OwnerEntityCard, OwnerEntityCardStack, ownerListActionClass } from "@/components/owner/OwnerEntityCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useOrders } from "@/hooks/use-rest-api";
import { useAuth } from "@/lib/auth-context";
import { ownerStaffShowsRestaurantColumn } from "@/lib/restaurant-table-column";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { MapPin, Receipt } from "lucide-react";

export const Route = createFileRoute("/owner/orders")({ component: OrdersPage });

interface OrderRow {
  id: number;
  order_id: string;
  order_type: string;
  status: string;
  sub_total?: string | number;
  service_charge?: string | number;
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

  const subtitle = (o: OrderRow) => {
    if (showRestaurantCol && o.restaurant_name) {
      return (
        <span className="inline-flex items-start gap-1.5">
          <MapPin size={14} className="mt-0.5 shrink-0 text-primary" aria-hidden />
          <span>{o.restaurant_name}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 capitalize text-text-secondary">
        <Receipt size={14} className="shrink-0 text-primary" aria-hidden />
        {String(o.order_type ?? "").replace(/_/g, " ") || "—"}
      </span>
    );
  };

  return (
    <>
      <h2 className="mb-4 font-display text-lg font-semibold text-foreground">Orders</h2>
      {errMsg && <p className="mb-2 text-sm text-error">{errMsg}</p>}
      {isLoading && <p className="mb-4 text-sm text-text-muted">Loading orders…</p>}
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
      {!isLoading && filtered.length === 0 ? (
        <p className="text-sm text-text-muted">No orders match this filter.</p>
      ) : !isLoading ? (
        <OwnerEntityCardStack>
          {filtered.map((o) => (
            <OwnerEntityCard
              key={o.id}
              onClick={() => {
                void navigate({ to: "/owner/orders/$id", params: { id: String(o.id) } });
              }}
              leading={
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Receipt strokeWidth={2} aria-hidden />
                </div>
              }
              title={o.order_id}
              subtitle={subtitle(o)}
              meta={
                <div className="flex flex-col items-end gap-1 text-right">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <StatusBadge status={o.order_type} />
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="space-y-0.5 text-xs text-text-muted">
                    {o.sub_total != null ? (
                      <p>
                        Subtotal: <span className="font-mono">₹{Number(o.sub_total).toLocaleString()}</span>
                      </p>
                    ) : null}
                    <p>
                      Service charge:{" "}
                      <span className="font-mono">₹{Number(o.service_charge ?? 0).toLocaleString()}</span>
                    </p>
                    <p className="text-base font-semibold text-foreground">
                      Total: <span className="font-mono">₹{Number(o.total).toLocaleString()}</span>
                    </p>
                  </div>
                </div>
              }
              actions={
                <Link
                  to="/owner/orders/$id"
                  params={{ id: String(o.id) }}
                  onClick={(e) => e.stopPropagation()}
                  className={ownerListActionClass}
                >
                  View order
                </Link>
              }
            />
          ))}
        </OwnerEntityCardStack>
      ) : null}
    </>
  );
}
