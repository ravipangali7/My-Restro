import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { useMemo, type DependencyList } from "react";
import { OwnerEntityCard, ownerListActionClass } from "@/components/owner/OwnerEntityCard";
import { ListPageShell, PaginatedList } from "@/components/shared/PaginatedList";
import { RouteFormModal } from "@/components/shared/RouteFormModal";
import { useRestaurants } from "@/hooks/use-rest-api";
import { apiGet, resolveMediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ownerStaffShowsRestaurantColumn } from "@/lib/restaurant-table-column";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { Layers, MapPin, Plus, Sparkles } from "lucide-react";

export const Route = createFileRoute("/owner/combos")({ component: CombosPage });

interface ComboRow {
  id: number;
  name: string;
  image?: string | null;
  discount_type: "flat" | "percentage";
  discount: string | number;
  total_product_price?: string | number;
  price: string | number;
  description?: string;
  products: number[];
  restaurant?: number;
  restaurant_name?: string;
}

function CombosPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const goToCombo = (c: ComboRow) => {
    void navigate({ to: "/owner/combos/$id", params: { id: String(c.id) } });
  };
  const isBaseRoute = pathname === "/owner/combos";
  const isFormModalRoute = pathname === "/owner/combos/new" || /^\/owner\/combos\/\d+$/.test(pathname);

  const { token, user } = useAuth();
  const { restaurantId, restaurantIds } = useRestaurantScope();
  const { data: restaurantsRaw = [] } = useRestaurants();

  /** Match products/categories: load every scoped restaurant so combos stay under the right location. */
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

  const comboQueries = useQueries({
    queries: useMemo(
      () =>
        fetchIds.map((rid) => ({
          queryKey: ["combo-sets", rid, token] as const,
          queryFn: () => apiGet<unknown[]>(`/api/combo-sets/?restaurant_id=${rid}`, token),
          enabled: Boolean(token && fetchIds.length),
        })),
      [fetchIds, token],
    ),
  });

  const isLoading = fetchIds.length > 0 && comboQueries.some((q) => q.isPending);
  const loadError = comboQueries.find((q) => q.error)?.error;

  const groupedSections = useMemo(() => {
    return fetchIds.map((rid, idx) => {
      const rows = (comboQueries[idx]?.data ?? []) as ComboRow[];
      const title = restaurantNameById.get(rid) ?? rows[0]?.restaurant_name ?? `Restaurant #${rid}`;
      return { rid, title, rows };
    });
  }, [fetchIds, comboQueries, restaurantNameById]);

  const showRestaurantCol = ownerStaffShowsRestaurantColumn(user) && fetchIds.length <= 1;
  const multiVenue = fetchIds.length > 1;

  const renderComboCards = (rows: ComboRow[], resetDeps: DependencyList) => (
    <PaginatedList
      items={rows}
      resetDeps={resetDeps}
      empty={<p className="text-sm text-text-muted">No combo sets in this restaurant yet.</p>}
      renderItem={(c, sel) => {
        const url = resolveMediaUrl(c.image);
        const itemCount = Array.isArray(c.products) ? c.products.length : 0;
        const discountLabel =
          c.discount_type === "percentage" ? `${Number(c.discount)}% off` : `₹${Number(c.discount).toLocaleString()} off`;
        return (
          <OwnerEntityCard
            {...(sel.selectable ? sel : {})}
            onClick={() => goToCombo(c)}
            leading={
              url ? (
                <img src={url} alt="" className="h-12 w-12 rounded-xl border border-border object-cover shadow-sm" loading="lazy" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Layers strokeWidth={2} aria-hidden />
                </div>
              )
            }
            title={c.name}
            subtitle={
              !multiVenue && showRestaurantCol && c.restaurant_name ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={14} className="shrink-0 text-primary" aria-hidden />
                  <span>{c.restaurant_name}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-text-secondary">
                  <Sparkles size={14} className="shrink-0 text-primary" aria-hidden />
                  <span>
                    {itemCount} item{itemCount === 1 ? "" : "s"} · {discountLabel}
                  </span>
                </span>
              )
            }
            meta={<span className="font-mono text-base font-semibold text-foreground">₹{Number(c.price).toLocaleString()}</span>}
            actions={
              <Link
                to="/owner/combos/$id"
                params={{ id: String(c.id) }}
                onClick={(e) => e.stopPropagation()}
                className={ownerListActionClass}
              >
                View combo
              </Link>
            }
          />
        );
      }}
    />
  );

  if (fetchIds.length === 0) return <p className="text-sm text-text-muted">No restaurant context.</p>;
  if (loadError) return <p className="text-sm text-error">Failed to load combo sets.</p>;
  if (isLoading) return <p className="text-sm text-text-muted">Loading…</p>;

  return (
    <>
      <ListPageShell
        fillViewport
        header={
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-lg text-foreground">Combo Sets</h2>
            <Link
              to="/owner/combos/$id"
              params={{ id: "new" }}
              className="h-10 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary-600 inline-flex items-center gap-1"
            >
              <Plus size={14} /> Add Combo
            </Link>
          </div>
        }
      >
        <div className="flex flex-col gap-8 min-h-0 flex-1">
          {groupedSections.map(({ rid, title, rows }) => (
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
                <p className="text-sm text-text-muted">No combo sets in this restaurant yet.</p>
              ) : (
                renderComboCards(rows, [rid])
              )}
            </ListPageShell>
          ))}
        </div>
      </ListPageShell>
      {isFormModalRoute ? (
        <RouteFormModal title="Combo set" onClose={() => navigate({ to: "/owner/combos" })}>
          <Outlet />
        </RouteFormModal>
      ) : !isBaseRoute ? (
        <Outlet />
      ) : null}
    </>
  );
}
