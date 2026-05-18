import { createFileRoute } from "@tanstack/react-router";
import { PaginatedList } from "@/components/shared/PaginatedList";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Checkbox } from "@/components/ui/checkbox";
import { useOrders } from "@/hooks/use-rest-api";
import { restaurantDisplayName } from "@/lib/restaurant-table-column";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/customer/transactions")({
  component: CustomerTransactions,
});

interface OrderRow {
  id: number;
  order_id: string;
  order_type?: string;
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
    <>
      <div className="px-4 pt-6 pb-4">
        <h1 className="font-display font-bold text-xl text-foreground">Payments & orders</h1>
        <p className="text-xs text-text-muted mt-1">
          Your orders from the API (financial ledger per restaurant is owner-facing).
        </p>
      </div>
      <div className="px-4 pb-8">
        <PaginatedList
          items={rows}
          empty={
            <div className="rounded-xl border border-dashed border-border bg-surface-alt/30 py-8 px-4 text-center text-sm text-text-muted">
              No payments or orders yet.
            </div>
          }
          renderItem={(order, sel) => (
            <div
              className={cn(
                "flex w-full items-center rounded-xl border border-border bg-card p-4 text-left transition-shadow hover:shadow-sm",
                sel.selectable && sel.selected && "border-primary/40 bg-primary/[0.04] ring-1 ring-primary/20",
              )}
            >
              {sel.selectable ? (
                <div className="shrink-0 pr-3" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={sel.selected}
                    onCheckedChange={(c) => sel.onSelectedChange(c === true)}
                    aria-label="Select order"
                  />
                </div>
              ) : null}
              <div className="min-w-0 flex-1 flex items-center justify-between gap-4">
                <div className="min-w-0 pr-3">
                  <p className="text-sm font-semibold text-foreground font-mono">{order.order_id}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <StatusBadge status={order.status} />
                    {order.order_type ? (
                      <span className="text-xs text-text-muted capitalize">{order.order_type}</span>
                    ) : null}
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5">{restaurantDisplayName(order)}</p>
                  <p className="text-xs text-text-muted mt-1">{new Date(order.created_at).toLocaleString()}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-foreground font-mono">₹{Number(order.total).toLocaleString()}</p>
                  <div className="mt-1 flex justify-end">
                    <StatusBadge status={order.payment_status} />
                  </div>
                </div>
              </div>
            </div>
          )}
        />
      </div>
    </>
  );
}
