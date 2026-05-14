import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { StatCard, StatCardsGrid } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { MenuMediaThumb } from "@/components/shared/MenuMediaThumb";
import { ViewField, ViewSection } from "@/components/shared/ViewField";
import { DataTable } from "@/components/shared/DataTable";
import { useOrderDetail, useTransitionOrderStatus } from "@/hooks/use-rest-api";
import { orderCustomerDisplay } from "@/lib/order-customer-display";
import { restaurantDisplayName } from "@/lib/restaurant-table-column";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { downloadOrderBillBlob, downloadOrderBillImage, fetchOrderBillImage } from "@/lib/order-bill";
import { ArrowLeft, ShoppingBag, DollarSign, Users, Clock, Eye, FileDown } from "lucide-react";

export const Route = createFileRoute("/owner/orders_/$id")({ component: OrderViewPage });

type BillPreviewState =
  | null
  | { session: number; orderLabel: string; status: "loading" }
  | { session: number; orderLabel: string; status: "ready"; blob: Blob; objectUrl: string }
  | { session: number; orderLabel: string; status: "error"; errorMessage: string };

interface OrderDetail {
  id: number;
  order_id: string;
  order_type: string;
  bill_available?: boolean;
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
  service_charge?: string | number;
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
    line_label?: string | null;
    line_image?: string | null;
  }>;
}

function OrderViewPage() {
  const { id } = Route.useParams();
  const orderId = Number(id);
  const { data, isLoading, error } = useOrderDetail(Number.isFinite(orderId) ? orderId : null);
  const transitionOrder = useTransitionOrderStatus();
  const order = data as OrderDetail | undefined;
  const [rejectReason, setRejectReason] = useState("");
  const [billDownloading, setBillDownloading] = useState(false);
  const [billPreview, setBillPreview] = useState<BillPreviewState>(null);
  const billPreviewSessionRef = useRef(0);

  const openBillPreview = () => {
    if (!order) return;
    billPreviewSessionRef.current += 1;
    const session = billPreviewSessionRef.current;
    setBillPreview({ session, orderLabel: order.order_id, status: "loading" });
    void fetchOrderBillImage(order.id)
      .then((blob) => {
        if (billPreviewSessionRef.current !== session) return;
        const objectUrl = URL.createObjectURL(blob);
        setBillPreview({ session, orderLabel: order.order_id, status: "ready", blob, objectUrl });
      })
      .catch((e) => {
        if (billPreviewSessionRef.current !== session) return;
        setBillPreview({
          session,
          orderLabel: order.order_id,
          status: "error",
          errorMessage: e instanceof Error ? e.message : "Could not load bill.",
        });
      });
  };

  const closeBillPreview = () => {
    billPreviewSessionRef.current += 1;
    setBillPreview((prev) => {
      if (prev?.status === "ready") URL.revokeObjectURL(prev.objectUrl);
      return null;
    });
  };

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

      <StatCardsGrid className="mb-6">
        <StatCard icon={DollarSign} label="Total" value={`₹${Number(order.total).toLocaleString()}`} />
        <StatCard icon={ShoppingBag} label="Items" value={items.length} />
        <StatCard icon={Users} label="People" value={order.people_for} />
        <StatCard icon={Clock} label="Payment" value={order.payment_method} />
      </StatCardsGrid>

      {order.bill_available ? (
        <ViewSection title="Bill">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              title="Preview bill"
              onClick={() => openBillPreview()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-primary-50 hover:text-primary"
            >
              <Eye size={16} aria-hidden />
              Preview bill
            </button>
            <button
              type="button"
              title="Download bill"
              disabled={billDownloading}
              onClick={() => {
                setBillDownloading(true);
                void downloadOrderBillImage(order.id, order.order_id)
                  .catch((e) => {
                    console.error(e);
                    window.alert(e instanceof Error ? e.message : "Could not download bill.");
                  })
                  .finally(() => setBillDownloading(false));
              }}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-primary-50 hover:text-primary disabled:opacity-50"
            >
              <FileDown size={16} aria-hidden />
              {billDownloading ? "Downloading…" : "Download bill"}
            </button>
          </div>
        </ViewSection>
      ) : null}

      <ViewSection title="Order Details">
        <div className="mb-4 p-3 rounded-xl border border-border bg-surface">
          <p className="text-xs text-text-secondary mb-2">Update Order Status</p>
          <p className="text-xs text-text-muted mb-3 max-w-xl">
            The customer receives an SMS on each successful status change when a phone is available; SMS usage is billed to
            this restaurant.
          </p>
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
          {Number(order.service_charge ?? 0) > 0 ? (
            <ViewField label="Service charge" value={`₹${Number(order.service_charge).toLocaleString()}`} />
          ) : null}
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
            {
              header: "Item",
              accessor: (oi) => {
                const label = (oi.line_label ?? "").trim() || `Item #${oi.id}`;
                return (
                  <span className="inline-flex items-center gap-3 min-w-0">
                    <MenuMediaThumb
                      mediaPath={oi.line_image ?? null}
                      alt={label}
                      className="h-12 w-12 shrink-0 rounded-lg border border-border"
                    />
                    <span className="min-w-0">
                      <span className="font-medium block truncate max-w-[14rem] sm:max-w-xs">{label}</span>
                      <span className="text-[11px] text-text-muted">
                        {oi.product_item != null
                          ? `Unit #${oi.product_item}`
                          : oi.comboset != null
                            ? `Combo #${oi.comboset}`
                            : oi.product != null
                              ? `Product #${oi.product}`
                              : ""}
                      </span>
                    </span>
                  </span>
                );
              },
            },
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

      <Dialog
        open={billPreview != null}
        onOpenChange={(open) => {
          if (!open) closeBillPreview();
        }}
      >
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="border-b border-border px-6 py-4 pr-14 text-left">
            <DialogTitle className="font-display text-lg">Bill preview</DialogTitle>
            <DialogDescription>{billPreview ? `Order ${billPreview.orderLabel}` : ""}</DialogDescription>
          </DialogHeader>
          <div className="min-h-[12rem] flex-1 overflow-auto bg-muted/30 px-6 py-4">
            {billPreview?.status === "loading" ? (
              <p className="text-sm text-muted-foreground">Loading bill…</p>
            ) : null}
            {billPreview?.status === "error" ? <p className="text-sm text-error">{billPreview.errorMessage}</p> : null}
            {billPreview?.status === "ready" ? (
              <img
                src={billPreview.objectUrl}
                alt={`Bill for order ${billPreview.orderLabel}`}
                className="mx-auto max-h-[70vh] w-full max-w-full object-contain"
              />
            ) : null}
          </div>
          {billPreview?.status === "ready" ? (
            <DialogFooter className="border-t border-border bg-card px-6 py-4 sm:justify-between">
              <button
                type="button"
                onClick={() => closeBillPreview()}
                className="h-10 rounded-lg border border-border px-4 text-sm font-semibold text-text-secondary hover:bg-surface-alt"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  downloadOrderBillBlob(billPreview.blob, billPreview.orderLabel);
                }}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <FileDown size={16} aria-hidden />
                Download
              </button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

