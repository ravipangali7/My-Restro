import { createFileRoute } from "@tanstack/react-router";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Store, Search, MapPin } from "lucide-react";
import { useMemo, useState } from "react";
import { usePublicRestaurants } from "@/hooks/use-rest-api";

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
      <div className="px-4 space-y-3 pb-8">
        {filtered.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() =>
              void navigate({
                to: "/customer",
                search: { restaurantId: r.id },
              })
            }
            className="w-full text-left bg-card rounded-xl border border-border p-4 flex items-center gap-4 hover:shadow-sm transition-shadow"
          >
            <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
              <Store size={24} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{r.name}</p>
              <p className="text-xs text-text-muted flex items-center gap-1 truncate">
                <MapPin size={10} /> {r.address}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <StatusBadge status={r.is_open ? "open" : "closed"} />
                {r.can_delivery && <span className="text-[10px] text-success font-medium">🚚 Delivery</span>}
                {r.can_delivery && r.delivery_radius_km != null ? (
                  <span className="text-[10px] text-text-muted">Inside {Number(r.delivery_radius_km).toLocaleString()} km</span>
                ) : null}
              </div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
