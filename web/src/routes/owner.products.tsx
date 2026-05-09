import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useQueries } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { RouteFormModal } from "@/components/shared/RouteFormModal";
import { DataTable } from "@/components/shared/DataTable";
import { useRestaurants } from "@/hooks/use-rest-api";
import { apiDelete, apiGet, resolveMediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ownerStaffShowsRestaurantColumn, restaurantTableColumn } from "@/lib/restaurant-table-column";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { ImagePlus, Pencil, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/owner/products")({ component: ProductsPage });

interface ProductRow {
  id: number;
  name: string;
  category: number | null;
  image?: string | null;
  is_veg: boolean;
  is_active: boolean;
  restaurant?: number;
  restaurant_name?: string;
}

interface ProductItemRow {
  id: number;
  product: number;
}

function ProductsPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isBaseRoute = pathname === "/owner/products";
  const isFormRoute = pathname === "/owner/products/new" || pathname.endsWith("/edit");
  /** Nested `/owner/products/:id` view — render only the child so the list is not duplicated behind the detail page. */
  const isProductViewOnlyRoute = /^\/owner\/products\/\d+$/.test(pathname);

  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const { restaurantId, restaurantIds } = useRestaurantScope();
  const { data: restaurantsRaw = [] } = useRestaurants();

  /** Owner portal: load every owned restaurant so products stay visible restaurant-wise. */
  const fetchIds = useMemo(() => {
    if (restaurantIds.length > 0) return [...restaurantIds].sort((a, b) => a - b);
    if (restaurantId != null) return [restaurantId];
    return [];
  }, [restaurantIds, restaurantId]);

  const restaurantNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of restaurantsRaw as { id: number; name: string }[]) m.set(r.id, r.name);
    return m;
  }, [restaurantsRaw]);

  const productQueries = useQueries({
    queries: useMemo(
      () =>
        fetchIds.map((rid) => ({
          queryKey: ["products", rid, token] as const,
          queryFn: () => apiGet<unknown[]>(`/api/products/?restaurant_id=${rid}`, token),
          enabled: Boolean(token && fetchIds.length),
        })),
      [fetchIds, token],
    ),
  });

  const categoryQueries = useQueries({
    queries: useMemo(
      () =>
        fetchIds.map((rid) => ({
          queryKey: ["categories", rid, token] as const,
          queryFn: () => apiGet<unknown[]>(`/api/categories/?restaurant_id=${rid}`, token),
          enabled: Boolean(token && fetchIds.length),
        })),
      [fetchIds, token],
    ),
  });

  const itemQueries = useQueries({
    queries: useMemo(
      () =>
        fetchIds.map((rid) => ({
          queryKey: ["product-items", rid, token] as const,
          queryFn: () => apiGet<unknown[]>(`/api/product-items/?restaurant_id=${rid}`, token),
          enabled: Boolean(token && fetchIds.length),
        })),
      [fetchIds, token],
    ),
  });

  const [deletingId, setDeletingId] = useState<number | null>(null);

  const isLoading =
    fetchIds.length > 0 &&
    (productQueries.some((q) => q.isPending) ||
      categoryQueries.some((q) => q.isPending) ||
      itemQueries.some((q) => q.isPending));

  const loadError =
    productQueries.find((q) => q.error)?.error ??
    categoryQueries.find((q) => q.error)?.error ??
    itemQueries.find((q) => q.error)?.error;

  const groupedSections = useMemo(() => {
    return fetchIds.map((rid, idx) => {
      const products = (productQueries[idx]?.data ?? []) as ProductRow[];
      const categories = (categoryQueries[idx]?.data ?? []) as { id: number; name: string }[];
      const items = (itemQueries[idx]?.data ?? []) as ProductItemRow[];

      const catName = new Map<number, string>();
      for (const c of categories) catName.set(c.id, c.name);

      const variantCount = new Map<number, number>();
      for (const pi of items) {
        const pid = pi.product;
        variantCount.set(pid, (variantCount.get(pid) ?? 0) + 1);
      }

      const title = restaurantNameById.get(rid) ?? products[0]?.restaurant_name ?? `Restaurant #${rid}`;
      return { rid, title, rows: products, catName, variantCount };
    });
  }, [fetchIds, productQueries, categoryQueries, itemQueries, restaurantNameById]);

  const showRestaurantCol = ownerStaffShowsRestaurantColumn(user) && fetchIds.length <= 1;

  if (fetchIds.length === 0) return <p className="text-sm text-text-muted">No restaurant context.</p>;
  if (loadError) return <p className="text-sm text-error">Failed to load products.</p>;
  if (isLoading) return <p className="text-sm text-text-muted">Loading…</p>;

  if (isProductViewOnlyRoute) {
    return <Outlet />;
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-foreground">Products</h2>
        <Link
          to="/owner/products/new"
          className="flex h-10 items-center gap-1 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-600"
        >
          <Plus size={14} /> Add Product
        </Link>
      </div>
      {groupedSections.map((section) => {
        const { rid, title, rows, catName, variantCount } = section;
        return (
          <div key={rid} className="mb-10 last:mb-0">
            {fetchIds.length > 1 ? (
              <h3 className="mb-3 font-display text-base font-semibold text-foreground">{title}</h3>
            ) : null}
            {rows.length === 0 ? (
              <p className="text-sm text-text-muted">No products in this restaurant yet.</p>
            ) : (
              <DataTable
                columns={[
                  {
                    header: "",
                    accessor: (p) => {
                      const url = resolveMediaUrl(p.image);
                      if (!url) {
                        return (
                          <div className="flex size-10 items-center justify-center rounded-lg border border-dashed border-border bg-surface text-text-muted">
                            <ImagePlus size={16} />
                          </div>
                        );
                      }
                      return (
                        <img
                          src={url}
                          alt=""
                          className="size-10 rounded-lg border border-border object-cover"
                          loading="lazy"
                        />
                      );
                    },
                  },
                  { header: "Name", accessor: "name" },
                  ...(showRestaurantCol ? [restaurantTableColumn<ProductRow>()] : []),
                  {
                    header: "Category",
                    accessor: (p) => (p.category != null ? catName.get(p.category) ?? "—" : "—"),
                  },
                  { header: "Variants", accessor: (p) => String(variantCount.get(p.id) ?? 0) },
                  {
                    header: "Actions",
                    accessor: (p) => (
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to="/owner/products/$id/edit"
                          params={{ id: String(p.id) }}
                          state={{ editorRestaurantId: p.restaurant ?? rid }}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-surface"
                        >
                          <Pencil size={12} /> Edit
                        </Link>
                        <Link
                          to="/owner/products/$id"
                          params={{ id: String(p.id) }}
                          className="text-xs font-medium text-primary"
                        >
                          View
                        </Link>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!token) return;
                            const scopeRid = p.restaurant ?? rid;
                            setDeletingId(p.id);
                            try {
                              await apiDelete(`/api/products/${p.id}/`, token);
                              void queryClient.invalidateQueries({ queryKey: ["products", scopeRid] });
                              void queryClient.invalidateQueries({ queryKey: ["product-items", scopeRid] });
                            } finally {
                              setDeletingId(null);
                            }
                          }}
                          disabled={deletingId === p.id}
                          className="inline-flex items-center gap-1 rounded-lg bg-error/10 px-2 py-1 text-xs font-medium text-error disabled:opacity-50"
                        >
                          <Trash2 size={12} /> {deletingId === p.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    ),
                  },
                ]}
                data={rows}
              />
            )}
          </div>
        );
      })}
      {isFormRoute ? (
        <RouteFormModal title="Product form" onClose={() => navigate({ to: "/owner/products" })}>
          <Outlet />
        </RouteFormModal>
      ) : !isBaseRoute ? <Outlet /> : null}
    </>
  );
}
