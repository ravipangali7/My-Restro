import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { MenuMediaThumb } from "@/components/shared/MenuMediaThumb";
import { ViewField, ViewSection } from "@/components/shared/ViewField";
import { DataTable } from "@/components/shared/DataTable";
import { useOrderDetail, useTransitionOrderStatus } from "@/hooks/use-rest-api";
import { orderCustomerDisplay } from "@/lib/order-customer-display";
import { restaurantDisplayName } from "@/lib/restaurant-table-column";
import { ArrowLeft, ShoppingBag, DollarSign, Users, Clock } from "lucide-react";

export const Route = createFileRoute("/owner/orders_/$id")({ component: OrderViewPage });

interface OrderDetail {
  id: number;
  order_id: string;
  order_type: string;
  restaurant?: number;
  restaurant_name?: string;
  customer: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  guest_customer_name?: string;
  guest_customer_phone?: string;
  table: number | null;
  table_name?: string | null;
  table_image?: string | null;
  waiter: number | null;
  status: string;
  payment_status: string;
  payment_method: string;
  people_for: number;
  sub_total: string | number;
  discount: string | number;
  delivery_fee?: string | number;
  total: string | number;
  address: string;
  reject_reason: string;
  items: Array<{
    id: number;
    product: number | null;
    product_item: number | null;
    comboset: number | null;
    price: string | number;
    quantity: string | number;
    total: string | number;
  }>;
}

function OrderViewPage() {
  const { id } = Route.useParams();
  const orderId = Number(id);
  const { data, isLoading, error } = useOrderDetail(Number.isFinite(orderId) ? orderId : null);
  const transitionOrder = useTransitionOrderStatus();
  const order = data as OrderDetail | undefined;
  const [rejectReason, setRejectReason] = useState("");

  if (isLoading) {
    return <p className="text-sm text-text-muted">Loading order…</p>;
  }
  if (error || !order) {
    return (
      <p className="text-sm text-error">
        {error instanceof Error ? error.message : "Order not found."}
      </p>
    );
  }

  const items = order.items ?? [];
  const tableDisplay = (() => {
    const name = (order.table_name ?? "").trim();
    if (name) return name;
    if (order.table != null && order.table !== "") return `Table #${order.table}`;
    return "—";
  })();
  const hasTable = Boolean((order.table_name ?? "").trim()) || order.table != null;
  const canReject =
    order.status !== "ready" &&
    order.status !== "waiting_pickup" &&
    order.status !== "delivered" &&
    order.status !== "rejected";
  const nextTransitions: Record<string, Array<{ label: string; value: string }>> = {
    pending: [{ label: "Accept Order", value: "accepted" }],
    accepted: [{ label: "Mark Running", value: "running" }],
    running: [{ label: "Mark Ready", value: "ready" }],
    ready: [],
    rejected: [],
  };
  const actions = nextTransitions[order.status] ?? [];
  const isSaving = transitionOrder.isPending;

  return (
    <>
      <Link to="/owner/orders" className="flex items-center gap-1 text-sm text-text-secondary hover:text-foreground mb-4">
        <ArrowLeft size={16} /> Back to Orders
      </Link>

      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center">
          <ShoppingBag size={24} className="text-primary" />
        </div>
        <div>
          <h2 className="font-display font-bold text-xl text-foreground">{order.order_id}</h2>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={order.status} />
            <StatusBadge status={order.order_type} />
            <StatusBadge status={order.payment_status} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={DollarSign} label="Total" value={`₹${Number(order.total).toLocaleString()}`} />
        <StatCard icon={ShoppingBag} label="Items" value={items.length} />
        <StatCard icon={Users} label="People" value={order.people_for} />
        <StatCard icon={Clock} label="Payment" value={order.payment_method} />
      </div>

      <ViewSection title="Order Details">
        <div className="mb-4 p-3 rounded-xl border border-border bg-surface">
          <p className="text-xs text-text-secondary mb-2">Update Order Status</p>
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <button
                key={action.value}
                type="button"
                disabled={isSaving}
                onClick={() => transitionOrder.mutate({ orderId: order.id, status: action.value })}
                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
              >
                {action.label}
              </button>
            ))}
          </div>
          {canReject && (
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Reject reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="flex-1 h-9 rounded-lg border border-border px-3 text-sm bg-card"
              />
              <button
                type="button"
                disabled={isSaving || !rejectReason.trim()}
                onClick={() =>
                  transitionOrder.mutate({
                    orderId: order.id,
                    status: "rejected",
                    rejectReason: rejectReason.trim(),
                  })
                }
                className="h-9 px-3 rounded-lg bg-error text-primary-foreground text-xs font-semibold disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          )}
          {transitionOrder.isError && (
            <p className="mt-2 text-xs text-error">
              {transitionOrder.error instanceof Error ? transitionOrder.error.message : "Could not update status."}
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <ViewField label="Restaurant" value={restaurantDisplayName(order)} />
          <ViewField label="Customer" value={orderCustomerDisplay(order)} />
          <ViewField label="Waiter" value={order.waiter != null ? `User #${order.waiter}` : "—"} />
          <ViewField
            label="Table"
            value={
              hasTable ? (
                <span className="inline-flex items-center gap-2 flex-wrap">
                  <MenuMediaThumb
                    mediaPath={order.table_image ?? null}
                    alt={tableDisplay}
                    className="h-12 w-12 shrink-0 rounded-lg border border-border"
                  />
                  <span>{tableDisplay}</span>
                </span>
              ) : (
                "—"
              )
            }
          />
          <ViewField label="Sub Total" value={`₹${Number(order.sub_total).toLocaleString()}`} />
          <ViewField label="Discount" value={`₹${Number(order.discount).toLocaleString()}`} />
          {order.order_type === "delivery" && Number(order.delivery_fee ?? 0) > 0 ? (
            <ViewField label="Delivery fee" value={`₹${Number(order.delivery_fee).toLocaleString()}`} />
          ) : null}
          <ViewField label="Total" value={`₹${Number(order.total).toLocaleString()}`} />
          {order.order_type === "delivery" && (
            <ViewField label="Delivery Address" value={order.address || "—"} className="sm:col-span-2" />
          )}
          {order.reject_reason && (
            <ViewField label="Reject Reason" value={order.reject_reason} className="sm:col-span-2" />
          )}
        </div>
      </ViewSection>

      <ViewSection title="Order Items">
        <DataTable
          columns={[
            { header: "Product ID", accessor: (oi) => oi.product ?? "—" },
            { header: "Item ID", accessor: (oi) => oi.product_item ?? oi.comboset ?? "—" },
            {
              header: "Price",
              accessor: (oi) => `₹${Number(oi.price).toLocaleString()}`,
            },
            {
              header: "Qty",
              accessor: (oi) => Number(oi.quantity).toLocaleString(),
            },
            {
              header: "Total",
              accessor: (oi) => `₹${Number(oi.total).toLocaleString()}`,
            },
          ]}
          data={items}
        />
      </ViewSection>
    </>
  );
}
