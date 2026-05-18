import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import type { DependencyList } from "react";
import { OwnerEntityCard, ownerListActionClass } from "@/components/owner/OwnerEntityCard";
import {
  GroupedListSections,
  ListPageShell,
  ownerEntityCardGridClass,
  PaginatedList,
} from "@/components/shared/PaginatedList";
import { RouteFormModal } from "@/components/shared/RouteFormModal";
import { useOwnerTablesByRestaurant, useRestaurants } from "@/hooks/use-rest-api";
import { resolveMediaUrl } from "@/lib/api";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { LayoutGrid, MapPin, Plus, Users } from "lucide-react";

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

  const goToTable = (t: TableRow) => {
    void navigate({ to: "/owner/tables/$id", params: { id: String(t.id) } });
  };

  const renderTableCards = (
    rows: TableRow[],
    resetDeps: DependencyList,
    { showVenueMeta = false }: { showVenueMeta?: boolean } = {},
  ) => (
    <PaginatedList
      items={rows}
      resetDeps={resetDeps}
      stackClassName={ownerEntityCardGridClass}
      empty={<p className="text-sm text-text-muted">No tables for this restaurant yet.</p>}
      renderItem={(t, sel) => {
        const url = resolveMediaUrl(t.image);
        const floorLine = (t.floor ?? "").trim();
        return (
          <OwnerEntityCard
            {...(sel.selectable ? sel : {})}
            onClick={() => goToTable(t)}
            className="h-full"
            leading={
              url ? (
                <img src={url} alt="" className="h-12 w-12 rounded-xl border border-border object-cover shadow-sm" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <LayoutGrid strokeWidth={2} aria-hidden />
                </div>
              )
            }
            title={t.name}
            subtitle={
              <span className="inline-flex items-center gap-1.5">
                <Users size={14} className="shrink-0 text-primary" aria-hidden />
                <span>
                  Seats {t.capacity}
                  {floorLine ? ` · ${floorLine}` : ""}
                </span>
              </span>
            }
            meta={
              showVenueMeta && t.restaurant_name ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
                  <MapPin size={12} className="shrink-0 text-primary" aria-hidden />
                  {t.restaurant_name}
                </span>
              ) : null
            }
            actions={
              <Link
                to="/owner/tables/$id"
                params={{ id: String(t.id) }}
                onClick={(e) => e.stopPropagation()}
                className={ownerListActionClass}
              >
                View table
              </Link>
            }
          />
        );
      }}
    />
  );

  if (restaurantIds.length === 0) {
    return <p className="text-sm text-text-muted">No restaurants assigned.</p>;
  }
  if (error) return <p className="text-sm text-error">Failed to load tables.</p>;
  if (isPending) return <p className="text-sm text-text-muted">Loading…</p>;

  return (
    <>
      <ListPageShell
        header={
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display font-semibold text-lg text-foreground">Tables</h2>
            <Link
              to="/owner/tables/add"
              className="flex h-10 items-center gap-1 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-600"
            >
              <Plus size={14} /> Add Table
            </Link>
          </div>
        }
      >
        {restaurantIds.length > 1 ? (
          <GroupedListSections
            sections={sections.map(({ restaurantId: rid, tables }) => {
              const rows = tables as TableRow[];
              return {
                key: rid,
                title: restaurantLabel(rid),
                children:
                  rows.length === 0 ? (
                    <p className="text-sm text-text-muted">No tables for this restaurant yet.</p>
                  ) : (
                    renderTableCards(rows, [rid])
                  ),
              };
            })}
          />
        ) : (sections[0]?.tables as TableRow[] | undefined)?.length === 0 ? (
          <p className="text-sm text-text-muted">No tables for this restaurant yet.</p>
        ) : (
          renderTableCards((sections[0]?.tables as TableRow[]) ?? [], [restaurantIds], { showVenueMeta: true })
        )}
      </ListPageShell>
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
