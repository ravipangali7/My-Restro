import { createFileRoute } from "@tanstack/react-router";
import { PaginatedList } from "@/components/shared/PaginatedList";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Store, Search, MapPin } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useMemo, useState } from "react";
import { usePublicRestaurants } from "@/hooks/use-rest-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/customer/restaurants")({
  component: CustomerRestaurants,
});

interface RestaurantRow {
  id: number;
  name: string;
  address: string;
  is_open: boolean;
  can_delivery: boolean;
  delivery_radius_km?: number | string;
}

function CustomerRestaurants() {
  const navigate = Route.useNavigate();
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = usePublicRestaurants();
  const rows = (data ?? []) as RestaurantRow[];

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.address.toLowerCase().includes(q));
  }, [rows, search]);

  const errMsg = error instanceof Error ? error.message : error ? String(error) : null;

  return (
    <>
      <div className="px-4 pt-6 pb-4">
        <h1 className="font-display font-bold text-xl text-foreground mb-3">Restaurants</h1>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search restaurants…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-11 pl-9 pr-4 rounded-xl border border-border bg-card text-sm focus:ring-2 focus:ring-primary/20 outline-none"
          />
        </div>
      </div>
      {errMsg && <p className="px-4 text-sm text-error">{errMsg}</p>}
      {isLoading && <p className="px-4 text-sm text-text-muted">Loading…</p>}
      <div className="px-4 pb-8">
        <PaginatedList
          items={filtered}
          resetDeps={[search]}
          empty={
            <div className="rounded-xl border border-dashed border-border bg-surface-alt/30 py-8 px-4 text-center text-sm text-text-muted">
              No restaurants found.
            </div>
          }
          renderItem={(r, sel) => (
            <div
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-shadow hover:shadow-sm",
                sel.selectable && sel.selected && "border-primary/40 bg-primary/[0.04] ring-1 ring-primary/20",
              )}
            >
              {sel.selectable ? (
                <div className="shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={sel.selected}
                    onCheckedChange={(c) => sel.onSelectedChange(c === true)}
                    aria-label="Select restaurant"
                  />
                </div>
              ) : null}
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 rounded-lg"
                onClick={() =>
                  void navigate({
                    to: "/customer",
                    search: { restaurantId: r.id },
                  })
                }
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary-50">
                  <Store size={24} className="text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{r.name}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-text-muted">
                    <MapPin size={10} /> {r.address}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <StatusBadge status={r.is_open ? "open" : "closed"} />
                    {r.can_delivery && <span className="text-[10px] font-medium text-success">🚚 Delivery</span>}
                    {r.can_delivery && r.delivery_radius_km != null ? (
                      <span className="text-[10px] text-text-muted">
                        Inside {Number(r.delivery_radius_km).toLocaleString()} km
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            </div>
          )}
        />
      </div>
    </>
  );
}
