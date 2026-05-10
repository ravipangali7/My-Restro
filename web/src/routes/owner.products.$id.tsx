import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ViewField, ViewSection } from "@/components/shared/ViewField";
import { DataTable } from "@/components/shared/DataTable";
import {
  useCategories,
  useProductItems,
  useProductRawMaterials,
  useProducts,
  useRawMaterials,
  useUnits,
} from "@/hooks/use-rest-api";
import { restaurantDisplayName } from "@/lib/restaurant-table-column";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { apiDelete } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ArrowLeft, Package, Leaf, Circle, Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/owner/products/$id")({ component: ProductViewPage });

function ProductViewPage() {
  const { id } = Route.useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const isEditRoute = pathname.endsWith("/edit");
  const { restaurantId, restaurantIds } = useRestaurantScope();
  const [deleting, setDeleting] = useState(false);
  const { data: products } = useProducts(restaurantId);
  const { data: categories } = useCategories(restaurantId);
  const { data: productItems } = useProductItems(restaurantId);
  const { data: prms } = useProductRawMaterials(restaurantId);
  const { data: rawMaterials } = useRawMaterials(restaurantId);
  const { data: units } = useUnits(restaurantId);

  const product = useMemo(() => {
    const list = (products as { id: number }[] | undefined) ?? [];
    return list.find((p) => String(p.id) === id);
  }, [products, id]);

  const category = useMemo(() => {
    const cid = (product as { category?: number } | undefined)?.category;
    if (cid == null) return undefined;
    return (categories as { id: number; name: string }[] | undefined)?.find((c) => c.id === cid);
  }, [product, categories]);

  const pid = (product as { id?: number } | undefined)?.id;
  const items = useMemo(() => {
    if (pid == null || !productItems) return [];
    return (productItems as { product: number }[]).filter((pi) => pi.product === pid);
  }, [pid, productItems]);

  const rawMats = useMemo(() => {
    if (pid == null || !prms) return [];
    return (prms as { product: number }[]).filter((prm) => prm.product === pid);
  }, [pid, prms]);

  const rmName = (rid: number) =>
    (rawMaterials as { id: number; name: string }[] | undefined)?.find((r) => r.id === rid)?.name ?? "—";

  const qtyWithUnit = (rid: number, q: number) => {
    const rm = (rawMaterials as { id: number; unit: number }[] | undefined)?.find((r) => r.id === rid);
    const sym = rm
      ? (units as { id: number; symbol: string }[] | undefined)?.find((u) => u.id === rm.unit)?.symbol ?? ""
      : "";
    return `${q} ${sym}`.trim();
  };

  if (!product && !isEditRoute) {
    return <p className="text-sm text-text-muted">Product not found.</p>;
  }

  if (isEditRoute) {
    return <Outlet />;
  }

  const pr = product as unknown as {
    id: number;
    name: string;
    is_veg: boolean;
    is_active: boolean;
    restaurant?: number;
    restaurant_name?: string;
  };

  const productId = Number(id);
  const scopeRid = pr.restaurant ?? restaurantId ?? restaurantIds[0] ?? null;

  return (
    <>
      <Link to="/owner/products" className="flex items-center gap-1 text-sm text-text-secondary hover:text-foreground mb-4">
        <ArrowLeft size={16} /> Back to Products
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary-50">
            <Package size={24} className="text-primary" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-foreground">{pr.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {pr.is_veg ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-success">
                  <Leaf size={12} /> Veg
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-semibold text-error">
                  <Circle size={12} className="fill-error" /> Non-Veg
                </span>
              )}
              <StatusBadge status={pr.is_active ? "active" : "inactive"} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/owner/products/$id/edit"
            params={{ id: String(productId) }}
            state={{ editorRestaurantId: scopeRid ?? undefined }}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-accent/60"
          >
            <Pencil size={14} aria-hidden /> Edit
          </Link>
          <button
            type="button"
            disabled={deleting || !token || scopeRid == null}
            onClick={async () => {
              const pid = productId;
              if (!token || !Number.isFinite(pid)) return;
              if (!window.confirm(`Delete product “${pr.name}”? This cannot be undone.`)) return;
              setDeleting(true);
              try {
                await apiDelete(`/api/products/${pid}/`, token);
                void queryClient.invalidateQueries({ queryKey: ["products", scopeRid] });
                void queryClient.invalidateQueries({ queryKey: ["product-items", scopeRid] });
                void navigate({ to: "/owner/products" });
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

      <ViewSection title="Product Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ViewField label="Restaurant" value={restaurantDisplayName(pr)} />
          <ViewField label="Category" value={category?.name || "—"} />
          <ViewField label="Active" value={pr.is_active ? "Yes" : "No"} />
          <ViewField label="Veg" value={pr.is_veg ? "Yes" : "No"} />
        </div>
      </ViewSection>

      <ViewSection title={`Product Items (${items.length})`}>
        <DataTable
          columns={[
            {
              header: "Unit",
              accessor: (pi) => {
                const u = (pi as { unit: number }).unit;
                return (units as { id: number; symbol: string; name: string }[] | undefined)?.find((x) => x.id === u)
                  ?.symbol ?? String(u);
              },
            },
            { header: "Price", accessor: (pi) => `₹${Number((pi as { price: number }).price).toLocaleString()}` },
            { header: "Discount Type", accessor: (pi) => (pi as { discount_type: string }).discount_type },
            {
              header: "Discount",
              accessor: (pi) => {
                const p = pi as { discount_type: string; discount: number };
                return p.discount_type === "percentage" ? `${p.discount}%` : `₹${p.discount}`;
              },
            },
            {
              header: "Effective",
              accessor: (pi) => {
                const p = pi as { discount_type: string; price: number; discount: number };
                const eff =
                  p.discount_type === "percentage"
                    ? Number(p.price) * (1 - Number(p.discount) / 100)
                    : Number(p.price) - Number(p.discount);
                return `₹${Math.round(eff)}`;
              },
            },
          ]}
          data={items}
        />
      </ViewSection>

      {rawMats.length > 0 && (
        <ViewSection title="Raw Material Mapping">
          <DataTable
            columns={[
              { header: "Raw Material", accessor: (prm) => rmName((prm as { raw_material: number }).raw_material) },
              {
                header: "Product Item",
                accessor: (prm) => {
                  const piid = (prm as { product_item: number }).product_item;
                  const pi = (productItems as { id: number; unit: number }[] | undefined)?.find((x) => x.id === piid);
                  if (!pi) return "—";
                  return (
                    (units as { id: number; symbol: string }[] | undefined)?.find((u) => u.id === pi.unit)?.symbol ??
                    String(pi.unit)
                  );
                },
              },
              {
                header: "Quantity",
                accessor: (prm) =>
                  qtyWithUnit(
                    (prm as { raw_material: number }).raw_material,
                    Number((prm as { raw_material_quantity: number }).raw_material_quantity),
                  ),
              },
            ]}
            data={rawMats}
          />
        </ViewSection>
      )}
    </>
  );
}
