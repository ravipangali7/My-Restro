import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { useMemo, type DependencyList } from "react";
import { OwnerEntityCard, ownerListActionClass } from "@/components/owner/OwnerEntityCard";
import { ListPageShell, PaginatedList } from "@/components/shared/PaginatedList";
import { RouteFormModal } from "@/components/shared/RouteFormModal";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useRestaurants } from "@/hooks/use-rest-api";
import { apiGet, resolveMediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ownerStaffShowsRestaurantColumn } from "@/lib/restaurant-table-column";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { MapPin, Package, Plus, Tag } from "lucide-react";

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

function ProductsPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const goToProduct = (p: ProductRow) => {
    void navigate({ to: "/owner/products/$id", params: { id: String(p.id) } });
  };
  const isBaseRoute = pathname === "/owner/products";
  const isFormRoute = pathname === "/owner/products/new" || pathname.endsWith("/edit");
  /** Nested `/owner/products/:id` view — render only the child so the list is not duplicated behind the detail page. */
  const isProductViewOnlyRoute = /^\/owner\/products\/\d+$/.test(pathname);

  const { token, user } = useAuth();
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

  const isLoading =
    fetchIds.length > 0 &&
    (productQueries.some((q) => q.isPending) || categoryQueries.some((q) => q.isPending));

  const loadError =
    productQueries.find((q) => q.error)?.error ?? categoryQueries.find((q) => q.error)?.error;

  const groupedSections = useMemo(() => {
    return fetchIds.map((rid, idx) => {
      const products = (productQueries[idx]?.data ?? []) as ProductRow[];
      const categories = (categoryQueries[idx]?.data ?? []) as { id: number; name: string }[];

      const catName = new Map<number, string>();
      for (const c of categories) catName.set(c.id, c.name);

      const title = restaurantNameById.get(rid) ?? products[0]?.restaurant_name ?? `Restaurant #${rid}`;
      return { rid, title, rows: products, catName };
    });
  }, [fetchIds, productQueries, categoryQueries, restaurantNameById]);

  const showRestaurantCol = ownerStaffShowsRestaurantColumn(user) && fetchIds.length <= 1;

  const renderProductCards = (sectionRows: ProductRow[], catName: Map<number, string>, resetDeps: DependencyList) => (
    <PaginatedList
      items={sectionRows}
      resetDeps={resetDeps}
      empty={<p className="text-sm text-text-muted">No products in this restaurant yet.</p>}
      renderItem={(p, sel) => {
        const url = resolveMediaUrl(p.image);
        const cat = p.category != null ? catName.get(p.category) ?? "—" : "—";
        const multiVenue = fetchIds.length > 1;
        return (
          <OwnerEntityCard
            {...(sel.selectable ? sel : {})}
            onClick={() => goToProduct(p)}
            leading={
              url ? (
                <img src={url} alt="" className="h-12 w-12 rounded-xl border border-border object-cover shadow-sm" loading="lazy" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Package strokeWidth={2} aria-hidden />
                </div>
              )
            }
            title={p.name}
            subtitle={
              !multiVenue && showRestaurantCol && p.restaurant_name ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={14} className="shrink-0 text-primary" aria-hidden />
                  <span>{p.restaurant_name}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <Tag size={14} className="shrink-0 text-primary" aria-hidden />
                  <span>{cat}</span>
                </span>
              )
            }
            meta={
              <>
                {p.is_veg ? <StatusBadge status="veg" /> : <StatusBadge status="non-veg" />}
                <StatusBadge status={p.is_active ? "active" : "inactive"} />
              </>
            }
            actions={
              <Link
                to="/owner/products/$id"
                params={{ id: String(p.id) }}
                onClick={(e) => e.stopPropagation()}
                className={ownerListActionClass}
              >
                View product
              </Link>
            }
          />
        );
      }}
    />
  );

  if (fetchIds.length === 0) return <p className="text-sm text-text-muted">No restaurant context.</p>;
  if (loadError) return <p className="text-sm text-error">Failed to load products.</p>;
  if (isLoading) return <p className="text-sm text-text-muted">Loading…</p>;

  if (isProductViewOnlyRoute) {
    return <Outlet />;
  }

  return (
    <>
      <ListPageShell
        fillViewport
        header={
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-foreground">Products</h2>
            <Link
              to="/owner/products/new"
              className="flex h-10 items-center gap-1 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-600"
            >
              <Plus size={14} /> Add Product
            </Link>
          </div>
        }
      >
        <div className="flex flex-col gap-8 min-h-0 flex-1">
          {groupedSections.map((section) => {
            const { rid, title, rows, catName } = section;
            return (
              <ListPageShell
                key={rid}
                header={
                  fetchIds.length > 1 ? (
                    <h3 className="mb-3 font-display text-base font-semibold text-foreground">{title}</h3>
                  ) : undefined
                }
                className="min-h-0 flex-1 basis-64"
              >
                {rows.length === 0 ? (
                  <p className="text-sm text-text-muted">No products in this restaurant yet.</p>
                ) : (
                  renderProductCards(rows, catName, [rid])
                )}
              </ListPageShell>
            );
          })}
        </div>
      </ListPageShell>
      {isFormRoute ? (
        <RouteFormModal title="Product form" onClose={() => navigate({ to: "/owner/products" })}>
          <Outlet />
        </RouteFormModal>
      ) : !isBaseRoute ? <Outlet /> : null}
    </>
  );
}
