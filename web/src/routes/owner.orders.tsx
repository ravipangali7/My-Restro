import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useOrders, useTransitionOrderStatus } from "@/hooks/use-rest-api";
import { useAuth } from "@/lib/auth-context";
import { ownerStaffShowsRestaurantColumn, restaurantTableColumn } from "@/lib/restaurant-table-column";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { orderCustomerDisplay } from "@/lib/order-customer-display";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { OrderTableVisual } from "@/components/shared/OrderTableVisual";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { downloadOrderBillBlob, downloadOrderBillImage, fetchOrderBillImage } from "@/lib/order-bill";
import { Eye, FileDown } from "lucide-react";

export const Route = createFileRoute("/owner/orders")({ component: OrdersPage });

type BillPreviewState =
  | null
  | {
      session: number;
      orderId: number;
      orderLabel: string;
      status: "loading";
    }
  | {
      session: number;
      orderId: number;
      orderLabel: string;
      status: "ready";
      blob: Blob;
      objectUrl: string;
    }
  | {
      session: number;
      orderId: number;
      orderLabel: string;
      status: "error";
      errorMessage: string;
    };

interface OrderRow {
  id: number;
  order_id: string;
  order_type: string;
  customer: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  guest_customer_name?: string;
  guest_customer_phone?: string;
  table: number | null;
  table_name?: string | null;
  table_image?: string | null;
  status: string;
  payment_status: string;
  total: string | number;
  restaurant?: number;
  restaurant_name?: string;
  bill_available?: boolean;
}

function OrdersPage() {
  const { user } = useAuth();
  const { restaurantId } = useRestaurantScope();
  const { data, isLoading, error } = useOrders(restaurantId, { refetchInterval: 5000 });
  const showRestaurantCol = ownerStaffShowsRestaurantColumn(user);
  const transitionOrder = useTransitionOrderStatus();
  const rows = (data ?? []) as OrderRow[];
  const [filter, setFilter] = useState("all");
  const [pendingTransition, setPendingTransition] = useState<{ orderId: number; status: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [billDownloadingId, setBillDownloadingId] = useState<number | null>(null);
  const [billPreview, setBillPreview] = useState<BillPreviewState>(null);
  const billPreviewSessionRef = useRef(0);

  const openBillPreview = (orderId: number, orderLabel: string) => {
    billPreviewSessionRef.current += 1;
    const session = billPreviewSessionRef.current;
    setBillPreview({
      session,
      orderId,
      orderLabel,
      status: "loading",
    });
    void fetchOrderBillImage(orderId)
      .then((blob) => {
        if (billPreviewSessionRef.current !== session) return;
        const objectUrl = URL.createObjectURL(blob);
        setBillPreview({
          session,
          orderId,
          orderLabel,
          status: "ready",
          blob,
          objectUrl,
        });
      })
      .catch((e) => {
        if (billPreviewSessionRef.current !== session) return;
        setBillPreview({
          session,
          orderId,
          orderLabel,
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

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((o) => o.status === filter);
  }, [rows, filter]);

  const errMsg = error instanceof Error ? error.message : error ? String(error) : null;
  const nextStatusOptions: Record<string, string[]> = {
    pending: ["accepted", "rejected"],
    accepted: ["running", "rejected"],
    running: ["ready", "rejected"],
    ready: [],
    rejected: [],
  };

  return (
    <>
      <h2 className="font-display font-semibold text-lg text-foreground mb-4">Orders</h2>
      {errMsg && <p className="text-sm text-error mb-2">{errMsg}</p>}
      {isLoading && <p className="text-sm text-text-muted mb-4">Loading orders…</p>}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {["all", "pending", "accepted", "running", "ready", "waiting_pickup", "delivered", "rejected"].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold capitalize whitespace-nowrap transition-all ${
              filter === f ? "bg-primary text-primary-foreground" : "bg-surface-alt text-text-secondary hover:bg-primary-50"
            }`}
          >
            {f === "all" ? "All" : f.replace(/_/g, " ")}
          </button>
        ))}
      </div>
      <DataTable
        columns={[
          { header: "Order ID", accessor: "order_id" },
          ...(showRestaurantCol ? [restaurantTableColumn<OrderRow>()] : []),
          { header: "Type", accessor: (o) => <StatusBadge status={o.order_type} /> },
          {
            header: "Customer",
            accessor: (o) => orderCustomerDisplay(o),
          },
          {
            header: "Table",
            accessor: (o) => <OrderTableVisual tableName={o.table_name} tableId={o.table} tableImage={o.table_image} compact />,
          },
          {
            header: "Status",
            accessor: (o) => (
              <div className="flex items-center gap-2">
                <StatusBadge status={o.status} />
                {(nextStatusOptions[o.status] ?? []).length > 0 ? (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const value = e.target.value;
                      if (!value) return;
                      setRejectReason("");
                      setPendingTransition({ orderId: o.id, status: value });
                      e.currentTarget.value = "";
                    }}
                    className="h-7 rounded-md border border-border bg-card px-2 text-xs capitalize"
                  >
                    <option value="">Change</option>
                    {(nextStatusOptions[o.status] ?? []).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            ),
          },
          { header: "Payment", accessor: (o) => <StatusBadge status={o.payment_status} /> },
          {
            header: "Total",
            accessor: (o) => `₹${Number(o.total).toLocaleString()}`,
          },
          {
            header: "Actions",
            accessor: (o) => (
              <div className="flex items-center gap-1 flex-wrap">
                <Link
                  to="/owner/orders/$id"
                  params={{ id: String(o.id) }}
                  className="px-2 py-1 text-xs rounded-lg bg-primary-50 text-primary font-medium hover:bg-primary-100"
                >
                  View
                </Link>
                {o.bill_available ? (
                  <>
                    <button
                      type="button"
                      title="Preview bill"
                      onClick={() => openBillPreview(o.id, o.order_id)}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-border bg-card text-foreground hover:bg-primary-50 hover:text-primary"
                    >
                      <Eye size={16} aria-hidden />
                      <span className="sr-only">Preview bill</span>
                    </button>
                    <button
                      type="button"
                      title="Download bill"
                      disabled={billDownloadingId === o.id}
                      onClick={() => {
                        setBillDownloadingId(o.id);
                        void downloadOrderBillImage(o.id, o.order_id)
                          .catch((e) => {
                            console.error(e);
                            window.alert(e instanceof Error ? e.message : "Could not download bill.");
                          })
                          .finally(() => setBillDownloadingId(null));
                      }}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-border bg-card text-foreground hover:bg-primary-50 hover:text-primary disabled:opacity-50"
                    >
                      <FileDown size={16} aria-hidden />
                      <span className="sr-only">Download bill</span>
                    </button>
                  </>
                ) : null}
              </div>
            ),
          },
        ]}
        data={filtered}
      />
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
            {billPreview?.status === "error" ? (
              <p className="text-sm text-error">{billPreview.errorMessage}</p>
            ) : null}
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
      <ConfirmModal
        open={pendingTransition != null}
        title="Update Order Status"
        message={
          pendingTransition
            ? pendingTransition.status === "rejected"
              ? "Rejecting this order requires a reason. It will be recorded on the order."
              : `Are you sure you want to move this order to "${pendingTransition.status}"?`
            : ""
        }
        confirmLabel={transitionOrder.isPending ? "Updating..." : "Confirm"}
        confirmDisabled={pendingTransition?.status === "rejected" && !rejectReason.trim()}
        onCancel={() => {
          setPendingTransition(null);
          setRejectReason("");
        }}
        onConfirm={() => {
          if (!pendingTransition) return;
          if (pendingTransition.status === "rejected" && !rejectReason.trim()) return;
          transitionOrder.mutate(
            {
              orderId: pendingTransition.orderId,
              status: pendingTransition.status,
              ...(pendingTransition.status === "rejected" ? { rejectReason: rejectReason.trim() } : {}),
            },
            {
              onSuccess: () => {
                setPendingTransition(null);
                setRejectReason("");
              },
            },
          );
        }}
        variant="warning"
        children={
          pendingTransition?.status === "rejected" ? (
            <div className="w-full mb-4 text-left">
              <label htmlFor="owner-orders-reject-reason" className="text-xs font-medium text-text-secondary block mb-1.5">
                Rejection reason
              </label>
              <textarea
                id="owner-orders-reject-reason"
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explain why this order is being rejected"
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-text-muted resize-y min-h-[4.5rem]"
              />
            </div>
          ) : undefined
        }
      />
    </>
  );
}
