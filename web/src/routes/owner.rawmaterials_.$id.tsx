import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { StatCard, StatCardsGrid } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ViewField, ViewSection } from "@/components/shared/ViewField";
import { DataTable } from "@/components/shared/DataTable";
import { useProductItems, useProductRawMaterials, useProducts, useRawMaterials, useStockLogs, useSuppliers, useUnits } from "@/hooks/use-rest-api";
import { restaurantDisplayName } from "@/lib/restaurant-table-column";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { useQueryClient } from "@tanstack/react-query";
import { apiDelete } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ArrowLeft, Package, AlertTriangle, Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/owner/rawmaterials_/$id")({ component: RawMaterialViewPage });

function RawMaterialViewPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const { restaurantId } = useRestaurantScope();
  const { data: rawMaterials } = useRawMaterials(restaurantId);
  const { data: suppliers } = useSuppliers(restaurantId);
  const { data: units } = useUnits(restaurantId);
  const { data: stockLogs } = useStockLogs(restaurantId);
  const { data: prms } = useProductRawMaterials(restaurantId);
  const { data: products } = useProducts(restaurantId);
  const { data: productItems } = useProductItems(restaurantId);

  const mat = useMemo(() => {
    const list = (rawMaterials as { id: number }[] | undefined) ?? [];
    return list.find((rm) => String(rm.id) === id);
  }, [rawMaterials, id]);

  const supplier = useMemo(() => {
    const sid = (mat as { supplier?: number } | undefined)?.supplier;
    if (sid == null) return undefined;
    return (suppliers as { id: number; name: string }[] | undefined)?.find((s) => s.id === sid);
  }, [mat, suppliers]);

  const unit = useMemo(() => {
    const uid = (mat as { unit?: number } | undefined)?.unit;
    if (uid == null) return undefined;
    return (units as { id: number; name: string; symbol: string }[] | undefined)?.find((u) => u.id === uid);
  }, [mat, units]);

  const mid = (mat as { id?: number } | undefined)?.id;
  const stockLogsForMat = useMemo(() => {
    if (mid == null || !stockLogs) return [];
    return (stockLogs as { raw_material: number }[]).filter((sl) => sl.raw_material === mid);
  }, [mid, stockLogs]);

  const usedInProducts = useMemo(() => {
    if (mid == null || !prms) return [];
    return (prms as { raw_material: number }[]).filter((prm) => prm.raw_material === mid);
  }, [mid, prms]);

  const productName = (pid: number) =>
    (products as { id: number; name: string }[] | undefined)?.find((p) => p.id === pid)?.name ?? "—";

  const itemUnitLabel = (productItemId: number) => {
    const pi = (productItems as { id: number; unit: number }[] | undefined)?.find((x) => x.id === productItemId);
    if (!pi) return "—";
    return (units as { id: number; symbol: string }[] | undefined)?.find((u) => u.id === pi.unit)?.symbol ?? "—";
  };

  if (!mat) {
    return <p className="text-sm text-text-muted">Raw material not found.</p>;
  }

  const m = mat as unknown as {
    name: string;
    stock: number;
    min_stock: number;
    price: number;
    restaurant?: number;
    restaurant_name?: string;
  };

  return (
    <>
      <Link to="/owner/rawmaterials" className="flex items-center gap-1 text-sm text-text-secondary hover:text-foreground mb-4">
        <ArrowLeft size={16} /> Back to Raw Materials
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary-50">
            <Package size={24} className="text-primary" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-foreground">{m.name}</h2>
            {Number(m.stock) <= Number(m.min_stock) && (
              <span className="flex items-center gap-1 text-xs font-semibold text-error">
                <AlertTriangle size={12} /> Low Stock
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/owner/rawmaterials"
            search={{ edit: Number(id) }}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-accent/60"
          >
            <Pencil size={14} aria-hidden /> Edit
          </Link>
          <button
            type="button"
            disabled={deleting || !token}
            onClick={async () => {
              if (!token || !window.confirm(`Delete raw material “${m.name}”? This cannot be undone.`)) return;
              const rid = m.restaurant ?? restaurantId;
              if (rid == null) return;
              setDeleting(true);
              try {
                await apiDelete(`/api/raw-materials/${id}/`, token);
                void queryClient.invalidateQueries({ queryKey: ["raw-materials", rid] });
                void navigate({ to: "/owner/rawmaterials" });
              } finally {
                setDeleting(false);
              }
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-error/10 px-4 text-sm font-semibold text-error hover:bg-error/15 disabled:opacity-50"
          >
            <Trash2 size={14} aria-hidden /> {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>

      <StatCardsGrid className="mb-6">
        <StatCard icon={Package} label="Current Stock" value={`${m.stock} ${unit?.symbol || ""}`} />
        <StatCard icon={AlertTriangle} label="Min Stock" value={`${m.min_stock} ${unit?.symbol || ""}`} />
      </StatCardsGrid>

      <ViewSection title="Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ViewField label="Restaurant" value={restaurantDisplayName(m)} />
          <ViewField label="Supplier" value={supplier?.name || "—"} />
          <ViewField label="Unit" value={unit?.name || "—"} />
          <ViewField label="Price" value={`₹${Number(m.price).toLocaleString()}`} />
        </div>
      </ViewSection>

      {usedInProducts.length > 0 && (
        <ViewSection title="Used In Products">
          <DataTable
            columns={[
              { header: "Product", accessor: (prm) => productName((prm as { product: number }).product) },
              {
                header: "Quantity",
                accessor: (prm) =>
                  `${(prm as { raw_material_quantity: number }).raw_material_quantity} ${unit?.symbol || ""}`,
              },
            ]}
            data={usedInProducts}
          />
        </ViewSection>
      )}

      <ViewSection title="Stock Log">
        <DataTable
          columns={[
            { header: "Date", accessor: "created_at" },
            { header: "Type", accessor: (sl) => <StatusBadge status={(sl as { type: string }).type} /> },
            {
              header: "Quantity",
              accessor: (sl) => `${(sl as { quantity: number }).quantity} ${unit?.symbol || ""}`,
            },
            {
              header: "Source",
              accessor: (sl) =>
                (sl as { purchase?: number; order?: number }).purchase
                  ? "Purchase"
                  : (sl as { order?: number }).order
                    ? "Order"
                    : "Manual",
            },
          ]}
          data={stockLogsForMat}
        />
      </ViewSection>
    </>
  );
}
