import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ViewField, ViewSection } from "@/components/shared/ViewField";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useOrderDetail, useOrders, usePurchaseDetail, useRawMaterials, useStockLogs, useUnits } from "@/hooks/use-rest-api";
import { restaurantDisplayName } from "@/lib/restaurant-table-column";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { ArrowLeft, ClipboardList } from "lucide-react";

export const Route = createFileRoute("/owner/stocklog_/$id")({ component: StockLogViewPage });

function StockLogViewPage() {
  const { id } = Route.useParams();
  const { restaurantId } = useRestaurantScope();
  const { data: stockLogs } = useStockLogs(restaurantId);
  const { data: rawMaterials } = useRawMaterials(restaurantId);
  const { data: units } = useUnits(restaurantId);
  const { data: orders } = useOrders(restaurantId);

  const log = useMemo(() => {
    const list = (stockLogs as { id: number }[] | undefined) ?? [];
    return list.find((sl) => String(sl.id) === id);
  }, [stockLogs, id]);

  const rawMatRow = useMemo(() => {
    const rid = (log as { raw_material?: number } | undefined)?.raw_material;
    if (rid == null) return undefined;
    return (rawMaterials as { id: number; name: string; unit: number }[] | undefined)?.find((r) => r.id === rid);
  }, [log, rawMaterials]);

  const unit = useMemo(() => {
    const uid = rawMatRow?.unit;
    if (uid == null) return undefined;
    return (units as { id: number; symbol: string }[] | undefined)?.find((u) => u.id === uid);
  }, [rawMatRow, units]);

  const purchaseId = (log as { purchase?: number } | undefined)?.purchase;
  const orderId = (log as { order?: number } | undefined)?.order;

  const { data: purchase } = usePurchaseDetail(purchaseId != null ? purchaseId : null);
  const { data: orderFromDetail } = useOrderDetail(orderId != null ? orderId : null);

  const orderSummary = useMemo(() => {
    if (orderId == null) return null;
    if (orderFromDetail) return orderFromDetail as { order_id: string; total: number };
    const o = (orders as { id: number; order_id: string; total: number }[] | undefined)?.find((x) => x.id === orderId);
    return o ?? null;
  }, [orderId, orderFromDetail, orders]);

  if (!log) {
    return <p className="text-sm text-text-muted">Stock log not found.</p>;
  }

  const lg = log as unknown as {
    type: string;
    created_at: string;
    quantity: number;
    restaurant?: number;
    restaurant_name?: string;
  };

  return (
    <>
      <Link to="/owner/stocklog" className="flex items-center gap-1 text-sm text-text-secondary hover:text-foreground mb-4">
        <ArrowLeft size={16} /> Back to Stock Log
      </Link>

      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center">
          <ClipboardList size={24} className="text-primary" />
        </div>
        <div>
          <h2 className="font-display font-bold text-xl text-foreground">Stock Log Entry</h2>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={lg.type} />
            <span className="text-sm text-text-muted">{lg.created_at}</span>
          </div>
        </div>
      </div>

      <ViewSection title="Entry Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ViewField label="Restaurant" value={restaurantDisplayName(lg)} />
          <ViewField label="Raw Material" value={rawMatRow?.name ?? "—"} />
          <ViewField label="Type" value={<StatusBadge status={lg.type} />} />
          <ViewField label="Quantity" value={`${lg.quantity} ${unit?.symbol || ""}`} />
          <ViewField label="Date" value={lg.created_at} />
        </div>
      </ViewSection>

      <ViewSection title="Source">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {purchase && (
            <ViewField
              label="Purchase"
              value={`${(purchase as { purchase_id: string }).purchase_id} — ₹${Number((purchase as { total: number }).total).toLocaleString()}`}
            />
          )}
          {orderSummary && (
            <ViewField
              label="Order"
              value={`${orderSummary.order_id} — ₹${Number(orderSummary.total).toLocaleString()}`}
            />
          )}
          {!purchase && !orderSummary && <ViewField label="Source" value="Manual Entry" />}
        </div>
      </ViewSection>
    </>
  );
}
