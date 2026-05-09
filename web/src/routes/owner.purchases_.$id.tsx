import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { StatCard } from "@/components/shared/StatCard";
import { ViewField, ViewSection } from "@/components/shared/ViewField";
import { DataTable } from "@/components/shared/DataTable";
import { usePurchaseDetail, useRawMaterials, useStockLogs, useSuppliers, useUnits } from "@/hooks/use-rest-api";
import { restaurantDisplayName } from "@/lib/restaurant-table-column";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { ArrowLeft, ShoppingCart, DollarSign } from "lucide-react";

export const Route = createFileRoute("/owner/purchases_/$id")({ component: PurchaseViewPage });

function PurchaseViewPage() {
  const { id } = Route.useParams();
  const pid = Number(id);
  const { restaurantId } = useRestaurantScope();
  const { data: purchase, isLoading } = usePurchaseDetail(Number.isFinite(pid) ? pid : null);
  const { data: suppliers } = useSuppliers(restaurantId);
  const { data: rawMaterials } = useRawMaterials(restaurantId);
  const { data: units } = useUnits(restaurantId);
  const { data: stockLogs } = useStockLogs(restaurantId);

  const supplier = useMemo(() => {
    const sid = (purchase as { supplier?: number } | undefined)?.supplier;
    if (sid == null) return undefined;
    return (suppliers as { id: number; name: string }[] | undefined)?.find((s) => s.id === sid);
  }, [purchase, suppliers]);

  const items = (purchase as { items?: { raw_material: number; price: number; quantity: number; total: number }[] } | undefined)?.items ?? [];

  const relatedStockLogs = useMemo(() => {
    const p = purchase as { id?: number } | undefined;
    if (!p?.id || !stockLogs) return [];
    return (stockLogs as { purchase?: number }[]).filter((sl) => sl.purchase === p.id);
  }, [purchase, stockLogs]);

  const rmName = (rid: number) =>
    (rawMaterials as { id: number; name: string }[] | undefined)?.find((r) => r.id === rid)?.name ?? "—";

  const qtyLabel = (rid: number, qty: number) => {
    const rm = (rawMaterials as { id: number; unit: number }[] | undefined)?.find((r) => r.id === rid);
    const sym = rm
      ? (units as { id: number; symbol: string }[] | undefined)?.find((u) => u.id === rm.unit)?.symbol ?? ""
      : "";
    return `${qty} ${sym}`.trim();
  };

  if (isLoading || !purchase) {
    return <p className="text-sm text-text-muted">Loading…</p>;
  }

  const p = purchase as {
    purchase_id: string;
    discount_type: string;
    discount: number;
    subtotal: number;
    total: number;
    restaurant?: number;
    restaurant_name?: string;
  };

  return (
    <>
      <Link to="/owner/purchases" className="flex items-center gap-1 text-sm text-text-secondary hover:text-foreground mb-4">
        <ArrowLeft size={16} /> Back to Purchases
      </Link>

      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center">
          <ShoppingCart size={24} className="text-primary" />
        </div>
        <div>
          <h2 className="font-display font-bold text-xl text-foreground">{p.purchase_id}</h2>
          <p className="text-sm text-text-muted">{supplier?.name}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <StatCard icon={DollarSign} label="Subtotal" value={`₹${Number(p.subtotal).toLocaleString()}`} />
        <StatCard
          icon={DollarSign}
          label="Discount"
          value={p.discount_type === "percentage" ? `${p.discount}%` : `₹${p.discount}`}
        />
        <StatCard icon={DollarSign} label="Total" value={`₹${Number(p.total).toLocaleString()}`} />
      </div>

      <ViewSection title="Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ViewField label="Restaurant" value={restaurantDisplayName(p)} />
          <ViewField label="Supplier" value={supplier?.name || "—"} />
          <ViewField label="Discount Type" value={p.discount_type} />
        </div>
      </ViewSection>

      <ViewSection title={`Items (${items.length})`}>
        <DataTable
          columns={[
            { header: "Raw Material", accessor: (pi) => rmName(pi.raw_material) },
            { header: "Price", accessor: (pi) => `₹${pi.price}` },
            { header: "Quantity", accessor: (pi) => qtyLabel(pi.raw_material, Number(pi.quantity)) },
            { header: "Total", accessor: (pi) => `₹${Number(pi.total).toLocaleString()}` },
          ]}
          data={items}
        />
      </ViewSection>

      {relatedStockLogs.length > 0 && (
        <ViewSection title="Related Stock Logs">
          <DataTable
            columns={[
              { header: "Date", accessor: "created_at" },
              { header: "Raw Material", accessor: (sl) => rmName((sl as { raw_material: number }).raw_material) },
              { header: "Quantity", accessor: (sl) => String((sl as { quantity: number }).quantity) },
            ]}
            data={relatedStockLogs}
          />
        </ViewSection>
      )}
    </>
  );
}
