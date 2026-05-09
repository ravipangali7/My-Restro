import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useQueries } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { RouteFormModal } from "@/components/shared/RouteFormModal";
import { useRestaurants } from "@/hooks/use-rest-api";
import { apiDelete, apiGet, resolveMediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ownerStaffShowsRestaurantColumn, restaurantTableColumn } from "@/lib/restaurant-table-column";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { Eye, ImagePlus, Pencil, Plus, Trash2 } from "lucide-react";

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
  const isBaseRoute = pathname === "/owner/combos";
  const isFormModalRoute = pathname === "/owner/combos/new" || /^\/owner\/combos\/\d+$/.test(pathname);

  const { token, user } = useAuth();
  const queryClient = useQueryClient();
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

  const productNameById = useMemo(() => {
    const byId = new Map<number, string>();
    for (const q of productQueries) {
      for (const p of (q.data ?? []) as { id: number; name: string }[]) {
        byId.set(p.id, p.name);
      }
    }
    return byId;
  }, [productQueries]);

  const productName = (id: number) => productNameById.get(id) ?? `#${id}`;

  const isLoading =
    fetchIds.length > 0 &&
    (comboQueries.some((q) => q.isPending) || productQueries.some((q) => q.isPending));
  const loadError =
    comboQueries.find((q) => q.error)?.error ?? productQueries.find((q) => q.error)?.error;

  const groupedSections = useMemo(() => {
    return fetchIds.map((rid, idx) => {
      const rows = (comboQueries[idx]?.data ?? []) as ComboRow[];
      const title = restaurantNameById.get(rid) ?? rows[0]?.restaurant_name ?? `Restaurant #${rid}`;
      return { rid, title, rows };
    });
  }, [fetchIds, comboQueries, restaurantNameById]);

  const showRestaurantCol = ownerStaffShowsRestaurantColumn(user) && fetchIds.length <= 1;
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const makeColumns = (sectionRid: number) =>
    [
      {
        header: "",
        accessor: (c: ComboRow) => {
          const url = resolveMediaUrl(c.image);
          if (!url) {
            return (
              <div className="flex size-10 items-center justify-center rounded-lg border border-dashed border-border bg-surface text-text-muted">
                <ImagePlus size={14} />
              </div>
            );
          }
          return <img src={url} alt="" className="size-10 rounded-lg border border-border object-cover" loading="lazy" />;
        },
      },
      { header: "Name", accessor: "name" as const },
      ...(showRestaurantCol ? [restaurantTableColumn<ComboRow>()] : []),
      {
        header: "Products",
        accessor: (c: ComboRow) => (c.products ?? []).map(productName).join(", ") || "—",
      },
      {
        header: "Discount",
        accessor: (c: ComboRow) =>
          c.discount_type === "percentage" ? `${Number(c.discount)}%` : `₹${Number(c.discount).toLocaleString()}`,
      },
      { header: "Final Price", accessor: (c: ComboRow) => `₹${Number(c.price).toLocaleString()}` },
      {
        header: "Actions",
        accessor: (c: ComboRow) => (
          <div className="flex items-center gap-2">
            <Link
              to="/owner/combos/$id"
              params={{ id: String(c.id) }}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-surface"
            >
              <Eye size={12} /> View
            </Link>
            <Link
              to="/owner/combos/$id"
              params={{ id: String(c.id) }}
              className="text-xs text-primary font-medium inline-flex items-center gap-1"
            >
              <Pencil size={12} /> Edit
            </Link>
            <button
              type="button"
              onClick={async () => {
                if (!token) return;
                setDeletingId(c.id);
                const scopeRid = c.restaurant ?? sectionRid;
                try {
                  await apiDelete(`/api/combo-sets/${c.id}/`, token);
                  void queryClient.invalidateQueries({ queryKey: ["combo-sets", scopeRid] });
                } finally {
                  setDeletingId(null);
                }
              }}
              disabled={deletingId === c.id}
              className="inline-flex items-center gap-1 rounded-lg bg-error/10 px-2 py-1 text-xs font-medium text-error disabled:opacity-50"
            >
              <Trash2 size={12} /> {deletingId === c.id ? "Deleting..." : "Delete"}
            </button>
          </div>
        ),
      },
    ] as const;

  if (fetchIds.length === 0) return <p className="text-sm text-text-muted">No restaurant context.</p>;
  if (loadError) return <p className="text-sm text-error">Failed to load combo sets.</p>;
  if (isLoading) return <p className="text-sm text-text-muted">Loading…</p>;

  return (
    <>
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
      {groupedSections.map(({ rid, title, rows }) => (
        <div key={rid} className="mb-10 last:mb-0">
          {fetchIds.length > 1 ? (
            <h3 className="mb-3 font-display text-base font-semibold text-foreground">{title}</h3>
          ) : null}
          {rows.length === 0 ? (
            <p className="text-sm text-text-muted">No combo sets in this restaurant yet.</p>
          ) : (
            <DataTable columns={[...makeColumns(rid)]} data={rows} />
          )}
        </div>
      ))}
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
