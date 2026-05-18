import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AddRestaurantModal } from "@/components/owner/AddRestaurantModal";
import { EditRestaurantModal, type EditRestaurantTarget } from "@/components/owner/EditRestaurantModal";
import { OwnerEntityCard, ownerListActionClass } from "@/components/owner/OwnerEntityCard";
import { PaginatedList } from "@/components/shared/PaginatedList";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useRestaurants } from "@/hooks/use-rest-api";
import { resolveMediaUrl } from "@/lib/api";
import { MapPin, Plus, Store, Truck } from "lucide-react";

export const Route = createFileRoute("/owner/restaurants")({
  validateSearch: (search: Record<string, unknown>) => ({
    add:
      search.add === "1" ||
      search.add === 1 ||
      search.add === true ||
      search.add === "true",
  }),
  component: OwnerRestaurantsPage,
});

interface RestaurantRow extends EditRestaurantTarget {
  logo?: string | null;
  slug?: string;
  due_balance?: string | number;
}

function subtitleForRestaurant(r: RestaurantRow) {
  const addr = (r.address ?? "").trim();
  if (addr) {
    const short = addr.split(",")[0]?.trim() || addr;
    return (
      <span className="inline-flex items-start gap-1.5">
        <MapPin size={14} className="mt-0.5 shrink-0 text-primary" aria-hidden />
        <span>{short.length > 80 ? `${short.slice(0, 77)}…` : short}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <MapPin size={14} className="shrink-0 text-primary" aria-hidden />
      {r.phone || "—"}
    </span>
  );
}

function OwnerRestaurantsPage() {
  const navigate = useNavigate({ from: "/owner/restaurants" });
  const { add } = Route.useSearch();
  const { data = [], isLoading, error } = useRestaurants();
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RestaurantRow | null>(null);

  useEffect(() => {
    if (add) {
      setModalOpen(true);
      void navigate({ to: "/owner/restaurants", search: {}, replace: true });
    }
  }, [add, navigate]);

  if (error) {
    return <p className="text-sm text-error">Failed to load restaurants.</p>;
  }
  if (isLoading) {
    return <p className="text-sm text-text-muted">Loading…</p>;
  }

  const rows = data as RestaurantRow[];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-foreground">Restaurants</h2>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex h-10 items-center gap-1 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={14} aria-hidden /> Add restaurant
        </button>
      </div>

      <PaginatedList
        items={rows}
        empty={<p className="text-sm text-text-muted">No restaurants yet.</p>}
        renderItem={(r, sel) => {
          const src = resolveMediaUrl(r.logo);
          const deliveryKm = r.delivery_radius_km != null ? Number(r.delivery_radius_km) : null;
          return (
            <OwnerEntityCard
              {...(sel.selectable ? sel : {})}
              onClick={() => {
                void navigate({ to: "/owner/restaurants/$restaurantId", params: { restaurantId: String(r.id) } });
              }}
                leading={
                  src ? (
                    <img
                      src={src}
                      alt=""
                      className="h-12 w-12 rounded-xl border border-border object-cover shadow-sm"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Store strokeWidth={2} aria-hidden />
                    </div>
                  )
                }
                title={r.name}
                subtitle={subtitleForRestaurant(r)}
                meta={
                  <>
                    {r.is_active === false ? <StatusBadge status="inactive" /> : <StatusBadge status="active" />}
                    {deliveryKm != null && Number.isFinite(deliveryKm) ? (
                      <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
                        <Truck size={14} className="text-success" aria-hidden />
                        <span className="font-medium text-success">Delivery</span>
                        <span className="text-text-muted">· Within {deliveryKm.toLocaleString()} km</span>
                      </span>
                    ) : null}
                  </>
                }
                actions={
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditTarget(r);
                      }}
                      className={ownerListActionClass}
                    >
                      Edit
                    </button>
                    <Link
                      to="/owner/restaurants/$restaurantId"
                      params={{ restaurantId: String(r.id) }}
                      onClick={(e) => e.stopPropagation()}
                      className={ownerListActionClass}
                    >
                      View details
                    </Link>
                  </>
                }
              />
          );
        }}
      />
      <AddRestaurantModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <EditRestaurantModal
        open={editTarget != null}
        restaurant={editTarget}
        onClose={() => setEditTarget(null)}
      />
    </>
  );
}
