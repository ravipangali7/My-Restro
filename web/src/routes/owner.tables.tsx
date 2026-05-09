import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RouteFormModal } from "@/components/shared/RouteFormModal";
import { DataTable } from "@/components/shared/DataTable";
import { useDeleteTable, useOwnerTablesByRestaurant, useRestaurants } from "@/hooks/use-rest-api";
import { resolveMediaUrl } from "@/lib/api";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { Pencil, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/owner/tables")({ component: TablesPage });

type TableRow = {
  id: number;
  restaurant: number;
  restaurant_name?: string;
  name: string;
  capacity: number;
  floor?: string;
  image?: string | null;
};

function TablesPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isBaseRoute = pathname === "/owner/tables";
  const isFormRoute = pathname === "/owner/tables/add" || pathname.endsWith("/edit");

  const { restaurantIds } = useRestaurantScope();
  const { sections, isPending, error } = useOwnerTablesByRestaurant();
  const { data: restaurantsRaw = [] } = useRestaurants();
  const restaurants = restaurantsRaw as { id: number; name: string }[];

  const restaurantLabel = (rid: number) => restaurants.find((r) => r.id === rid)?.name ?? `Restaurant #${rid}`;

  const deleteTable = useDeleteTable();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const columns = useMemo(
    () => [
      {
        header: "Image",
        className: "w-28",
        accessor: (t: TableRow) => {
          const url = resolveMediaUrl(t.image);
          return url ? (
            <img src={url} alt="" className="h-12 w-16 rounded-lg object-cover border border-border bg-surface" />
          ) : (
            <span className="text-xs text-text-muted">No image</span>
          );
        },
      },
      { header: "Name", accessor: "name" as const },
      { header: "Capacity", accessor: "capacity" as const },
      { header: "Floor", accessor: "floor" as const },
      {
        header: "Actions",
        accessor: (t: TableRow) => (
          <div className="flex items-center gap-2">
            <Link
              to="/owner/tables/$id"
              params={{ id: String(t.id) }}
              className="text-xs text-primary font-medium"
              onClick={(e) => e.stopPropagation()}
            >
              View
            </Link>
            <Link
              to="/owner/tables/$id/edit"
              params={{ id: String(t.id) }}
              className="text-xs text-info font-medium inline-flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <Pencil size={12} /> Edit
            </Link>
            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                const rid = t.restaurant;
                if (rid == null) return;
                if (!window.confirm(`Delete table "${t.name}"? This cannot be undone.`)) return;
                setDeletingId(t.id);
                try {
                  await deleteTable.mutateAsync({ tableId: t.id, restaurantId: rid });
                } finally {
                  setDeletingId(null);
                }
              }}
              disabled={deletingId === t.id}
              className="text-xs text-error font-medium inline-flex items-center gap-1 disabled:opacity-50"
            >
              <Trash2 size={12} /> {deletingId === t.id ? "Deleting..." : "Delete"}
            </button>
          </div>
        ),
      },
    ],
    [deleteTable, deletingId],
  );

  if (restaurantIds.length === 0) {
    return <p className="text-sm text-text-muted">No restaurants assigned.</p>;
  }
  if (error) return <p className="text-sm text-error">Failed to load tables.</p>;
  if (isPending) return <p className="text-sm text-text-muted">Loading…</p>;

  const renderTable = (rows: TableRow[]) => <DataTable<TableRow> columns={columns} data={rows} />;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-semibold text-lg text-foreground">Tables</h2>
        <Link
          to="/owner/tables/add"
          className="h-10 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center gap-1 hover:bg-primary-600"
        >
          <Plus size={14} /> Add Table
        </Link>
      </div>
      {restaurantIds.length > 1 ? (
        <div className="space-y-8">
          {sections.map(({ restaurantId: rid, tables }) => {
            const rows = tables as TableRow[];
            return (
              <section key={rid}>
                <h3 className="font-display font-semibold text-base text-foreground mb-3">{restaurantLabel(rid)}</h3>
                {rows.length === 0 ? (
                  <p className="text-sm text-text-muted">No tables for this restaurant yet.</p>
                ) : (
                  renderTable(rows)
                )}
              </section>
            );
          })}
        </div>
      ) : (sections[0]?.tables as TableRow[] | undefined)?.length === 0 ? (
        <p className="text-sm text-text-muted">No tables for this restaurant yet.</p>
      ) : (
        renderTable((sections[0]?.tables as TableRow[]) ?? [])
      )}
      {isFormRoute ? (
        <RouteFormModal title="Table form" onClose={() => navigate({ to: "/owner/tables" })}>
          <Outlet />
        </RouteFormModal>
      ) : !isBaseRoute ? (
        <Outlet />
      ) : null}
    </>
  );
}
