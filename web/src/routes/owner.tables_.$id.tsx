import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RouteFormModal } from "@/components/shared/RouteFormModal";
import { ViewField, ViewSection } from "@/components/shared/ViewField";
import { useDeleteTable, useOrders, useOwnerTablesByRestaurant } from "@/hooks/use-rest-api";
import { resolveMediaUrl } from "@/lib/api";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { ArrowLeft, LayoutGrid, MapPin, Pencil, Trash2 } from "lucide-react";
export const Route = createFileRoute("/owner/tables_/$id")({ component: TableViewPage });

function TableViewPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const deleteTable = useDeleteTable();
  const [deleting, setDeleting] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isEditRoute = pathname.endsWith("/edit");
  const { restaurantIds } = useRestaurantScope();
  const { sections, isPending: tablesPending } = useOwnerTablesByRestaurant();

  const table = useMemo(() => {
    const list = sections.flatMap((s) => (s.tables as { id: number }[]) ?? []);
    return list.find((t) => String(t.id) === id);
  }, [sections, id]);

  const tableRestaurantId = (table as { restaurant?: number } | undefined)?.restaurant ?? null;
  const { data: orders } = useOrders(tableRestaurantId);

  const tid = (table as { id?: number } | undefined)?.id;
  const tableOrders = useMemo(() => {
    if (tid == null || !orders) return [];
    return (orders as { table?: number }[]).filter((o) => o.table === tid);
  }, [orders, tid]);

  if (isEditRoute) {
    return (
      <RouteFormModal title="Table form" onClose={() => navigate({ to: "/owner/tables" })}>
        <Outlet />
      </RouteFormModal>
    );
  }

  if (restaurantIds.length === 0) {
    return <p className="text-sm text-text-muted">No restaurants assigned.</p>;
  }
  if (tablesPending && !table) {
    return <p className="text-sm text-text-muted">Loading…</p>;
  }
  if (!table) {
    return <p className="text-sm text-text-muted">Table not found.</p>;
  }

  const t = table as unknown as {
    name: string;
    floor: string;
    near_by: string;
    capacity: number;
    notes?: string;
    restaurant_name?: string;
    image?: string | null;
    latitude?: string | number | null;
    longitude?: string | number | null;
  };

  const imageUrl = resolveMediaUrl(t.image);

  return (
    <>
      <Link to="/owner/tables" className="flex items-center gap-1 text-sm text-text-secondary hover:text-foreground mb-4">
        <ArrowLeft size={16} /> Back to Tables
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          {imageUrl ? (
            <div className="h-16 w-24 shrink-0 overflow-hidden rounded-xl border border-border bg-surface">
              <img src={imageUrl} alt="" className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary-50">
              <LayoutGrid size={24} className="text-primary" />
            </div>
          )}
          <div>
            <h2 className="font-display text-xl font-bold text-foreground">{t.name}</h2>
            <p className="text-sm text-text-muted">{[t.restaurant_name, t.floor, t.near_by].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/owner/tables/$id/edit"
            params={{ id: String(id) }}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-accent/60"
          >
            <Pencil size={14} aria-hidden /> Edit
          </Link>
          <button
            type="button"
            disabled={deleting}
            onClick={async () => {
              const rid = (table as { restaurant?: number }).restaurant;
              if (rid == null) return;
              if (!window.confirm(`Delete table "${t.name}"? This cannot be undone.`)) return;
              setDeleting(true);
              try {
                await deleteTable.mutateAsync({ tableId: Number(id), restaurantId: rid });
                void navigate({ to: "/owner/tables" });
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

      <ViewSection title="Table Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {t.restaurant_name ? <ViewField label="Restaurant" value={t.restaurant_name} /> : null}
          <ViewField label="Capacity" value={`${t.capacity} seats`} />
          <ViewField label="Floor" value={t.floor} />
          <ViewField label="Near By" value={t.near_by} />
          <ViewField label="Notes" value={t.notes || "—"} />
          <ViewField
            label="Location"
            value={
              t.latitude != null && t.longitude != null ? (
                <span className="flex items-center gap-1">
                  <MapPin size={12} className="text-primary" /> {String(t.latitude)}, {String(t.longitude)}
                </span>
              ) : (
                "Not set"
              )
            }
          />
        </div>
      </ViewSection>

      <ViewSection title={`Orders at this table (${tableOrders.length})`}>
        {tableOrders.length > 0 ? (
          <div className="space-y-2">
            {(tableOrders as { id: number; order_id: string; status: string; payment_status: string; total: number }[]).map(
              (o) => (
                <div key={o.id} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold font-mono">{o.order_id}</p>
                    <p className="text-xs text-text-muted capitalize">
                      {o.status} · {o.payment_status}
                    </p>
                  </div>
                  <p className="text-sm font-bold font-mono">₹{Number(o.total).toLocaleString()}</p>
                </div>
              ),
            )}
          </div>
        ) : (
          <p className="text-sm text-text-muted">No orders at this table yet.</p>
        )}
      </ViewSection>
    </>
  );
}
