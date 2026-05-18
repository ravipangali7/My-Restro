import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { PaginatedList } from "@/components/shared/PaginatedList";
import { OrderTableVisual } from "@/components/shared/OrderTableVisual";
import { MenuMediaThumb } from "@/components/shared/MenuMediaThumb";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useOrderDetail, useOrders } from "@/hooks/use-rest-api";
import { restaurantDisplayName } from "@/lib/restaurant-table-column";
import { apiPost } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useState } from "react";
import { ChevronRight, MapPin } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/customer/orders")({
  component: CustomerOrders,
});

interface OrderRow {
  id: number;
  order_id: string;
  order_type: string;
  status: string;
  payment_status: string;
  sub_total: string | number;
  discount: string | number;
  service_charge?: string | number;
  total: string | number;
  restaurant?: number;
  restaurant_name?: string;
  table?: number | null;
  table_name?: string | null;
  table_image?: string | null;
  items?: Array<{
    id: number;
    product: number | null;
    quantity: string | number;
    total: string | number;
    line_label?: string | null;
    line_image?: string | null;
  }>;
}

function CustomerOrders() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data, isLoading, error } = useOrders(null);
  const { data: detailData } = useOrderDetail(selectedId);
  const customerOrders = (data ?? []) as OrderRow[];
  const selectedOrder = selectedId != null ? ((detailData ?? null) as OrderRow | null) : null;
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);

  const statusSteps = ["pending", "accepted", "running", "ready", "waiting_pickup", "delivered"];

  const errMsg = error instanceof Error ? error.message : error ? String(error) : null;

  return (
    <>
      <div className="px-4 pt-6 pb-4">
        <h1 className="font-display font-bold text-xl text-foreground">My Orders</h1>
      </div>
      {errMsg && <p className="px-4 text-sm text-error">{errMsg}</p>}
      {isLoading && <p className="px-4 text-sm text-text-muted">Loading…</p>}

      <div className="px-4 space-y-3">
        <PaginatedList
          items={customerOrders}
          empty={
            <div className="rounded-xl border border-dashed border-border bg-surface-alt/30 py-8 px-4 text-center text-sm text-text-muted">
              No orders yet.
            </div>
          }
          renderItem={(order, sel) => (
            <div
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-shadow hover:shadow-sm",
                sel.selectable && sel.selected && "border-primary/40 bg-primary/[0.04] ring-1 ring-primary/20",
              )}
            >
              {sel.selectable ? (
                <div className="shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={sel.selected}
                    onCheckedChange={(c) => sel.onSelectedChange(c === true)}
                    aria-label="Select order"
                  />
                </div>
              ) : null}
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center justify-between text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 rounded-lg"
                onClick={() => setSelectedId(order.id)}
              >
                <div>
                  <p className="text-sm font-semibold text-foreground font-mono">{order.order_id}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusBadge status={order.status} />
                    <span className="text-xs text-text-muted capitalize">{order.order_type}</span>
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5">{restaurantDisplayName(order)}</p>
                  <p className="text-xs text-text-muted mt-1">{order.items?.length ?? "—"} items</p>
                </div>
                <div className="text-right flex shrink-0 items-center gap-2">
                  <div>
                    <p className="text-sm font-bold text-foreground font-mono">₹{Number(order.total).toLocaleString()}</p>
                    <StatusBadge status={order.payment_status} />
                  </div>
                  <ChevronRight size={16} className="text-text-muted" />
                </div>
              </button>
            </div>
          )}
        />
      </div>

      {selectedOrder && selectedId != null && (
        <div className="fixed inset-0 bg-black/40 flex items-end lg:items-center justify-center z-50">
          <div className="bg-card rounded-t-2xl lg:rounded-2xl border border-border p-6 w-full max-w-md max-h-[min(92dvh,calc(100vh-2rem))] overflow-y-auto overscroll-contain shadow-xl">
            <div className="w-10 h-1 bg-border rounded-full mx-auto mb-4 lg:hidden" />
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-lg text-foreground">{selectedOrder.order_id}</h3>
              <button type="button" onClick={() => setSelectedId(null)} className="text-text-muted hover:text-foreground">
                ✕
              </button>
            </div>
            <p className="text-xs text-text-secondary mb-4">{restaurantDisplayName(selectedOrder)}</p>

            {String(selectedOrder.order_type).toLowerCase() !== "delivery" ? (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-surface-alt/40 px-3 py-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-text-muted shrink-0">Table</span>
                <OrderTableVisual
                  tableName={selectedOrder.table_name}
                  tableId={selectedOrder.table ?? null}
                  tableImage={selectedOrder.table_image}
                  compact
                />
              </div>
            ) : null}

            {selectedOrder.status !== "rejected" && (
              <div className="flex items-center justify-between mb-6 px-2">
                {statusSteps.map((step, i) => {
                  const currentIdx = statusSteps.indexOf(selectedOrder.status as (typeof statusSteps)[number]);
                  const idx = currentIdx >= 0 ? currentIdx : 0;
                  const isActive = i <= idx;
                  return (
                    <div key={step} className="flex flex-col items-center flex-1">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          isActive ? "bg-primary text-primary-foreground" : "bg-surface-alt text-text-muted"
                        }`}
                      >
                        {i + 1}
                      </div>
                      <span className={`text-[10px] mt-1 capitalize ${isActive ? "text-primary font-semibold" : "text-text-muted"}`}>{step}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="space-y-2 mb-4">
              {(selectedOrder.items ?? []).map((item) => {
                const label = (item.line_label ?? "").trim() || `Item #${item.id}`;
                return (
                  <div key={item.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                    <MenuMediaThumb
                      mediaPath={item.line_image ?? null}
                      alt={label}
                      className="h-14 w-14 shrink-0 rounded-xl border border-border"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground leading-snug">{label}</p>
                      <p className="text-xs text-text-muted mt-0.5">Qty: {Number(item.quantity).toLocaleString()}</p>
                    </div>
                    <p className="text-sm font-bold font-mono shrink-0">₹{Number(item.total).toLocaleString()}</p>
                  </div>
                );
              })}
            </div>

            {selectedOrder.status !== "rejected" &&
              selectedOrder.payment_status !== "success" &&
              token && (
                <div className="mb-4 rounded-xl border border-border bg-surface-alt/60 p-3">
                  <p className="text-xs text-text-muted mb-2">
                    When you are physically at the restaurant exit or pickup point, share your location so the cashier
                    can be notified if payment is still due.
                  </p>
                  {geoMsg && <p className="text-xs text-primary mb-2">{geoMsg}</p>}
                  <button
                    type="button"
                    disabled={geoBusy}
                    onClick={() => {
                      if (!token || selectedId == null) return;
                      setGeoBusy(true);
                      setGeoMsg(null);
                      if (!navigator.geolocation) {
                        setGeoMsg("Geolocation is not available in this browser.");
                        setGeoBusy(false);
                        return;
                      }
                      navigator.geolocation.getCurrentPosition(
                        async (pos) => {
                          try {
                            const res = (await apiPost<{
                              proximity_alert_triggered?: boolean;
                              distance_m?: number | null;
                            }>(
                              `/api/orders/${selectedId}/report-position/`,
                              {
                                latitude: pos.coords.latitude,
                                longitude: pos.coords.longitude,
                              },
                              token,
                            )) as { proximity_alert_triggered?: boolean; distance_m?: number | null };
                            void queryClient.invalidateQueries({ queryKey: ["orders"] });
                            void queryClient.invalidateQueries({ queryKey: ["order", selectedId] });
                            if (res.proximity_alert_triggered) {
                              setGeoMsg("Cashier has been alerted — please complete payment.");
                            } else {
                              const d = res.distance_m;
                              setGeoMsg(
                                d != null
                                  ? `Reported. Distance to alert point ≈ ${d.toFixed(1)} m (outside alert radius or already paid).`
                                  : "Location reported.",
                              );
                            }
                          } catch (e) {
                            setGeoMsg(e instanceof Error ? e.message : "Could not report location.");
                          } finally {
                            setGeoBusy(false);
                          }
                        },
                        () => {
                          setGeoMsg("Location permission denied or unavailable.");
                          setGeoBusy(false);
                        },
                        { enableHighAccuracy: true, timeout: 15_000 },
                      );
                    }}
                    className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    <MapPin size={16} />
                    {geoBusy ? "Getting location…" : "Share my location"}
                  </button>
                </div>
              )}

            <div className="border-t border-border pt-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Sub Total</span>
                <span className="font-mono">₹{Number(selectedOrder.sub_total).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Discount</span>
                <span className="font-mono">₹{Number(selectedOrder.discount).toLocaleString()}</span>
              </div>
              {Number(selectedOrder.service_charge ?? 0) > 0 ? (
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">Service charge</span>
                  <span className="font-mono">₹{Number(selectedOrder.service_charge).toLocaleString()}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-md font-bold border-t border-border pt-2">
                <span>Total</span>
                <span className="font-mono">₹{Number(selectedOrder.total).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
