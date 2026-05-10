import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AddRestaurantModal } from "@/components/owner/AddRestaurantModal";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useRestaurants } from "@/hooks/use-rest-api";
import { resolveMediaUrl } from "@/lib/api";
import { Plus } from "lucide-react";

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

interface RestaurantRow {
  id: number;
  name: string;
  phone: string;
  logo?: string | null;
  slug?: string;
  address: string;
  latitude: string | number | null;
  longitude: string | number | null;
  reference_latitude: string | number | null;
  reference_longitude: string | number | null;
  reference_distance_m: number | null;
  proximity_alert_radius_m: string | number;
  delivery_radius_km?: string | number;
  is_active?: boolean;
  due_balance?: string | number;
}

function OwnerRestaurantsPage() {
  const navigate = useNavigate({ from: "/owner/restaurants" });
  const { add } = Route.useSearch();
  const { data = [], isLoading, error } = useRestaurants();
  const [modalOpen, setModalOpen] = useState(false);

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
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-semibold text-lg text-foreground">Restaurants</h2>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="h-10 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm inline-flex items-center gap-1 hover:bg-primary/90"
        >
          <Plus size={14} /> Add restaurant
        </button>
      </div>
      <DataTable
        columns={[
          {
            header: "Logo",
            mobileHidden: true,
            accessor: (r: RestaurantRow) => {
              const src = resolveMediaUrl(r.logo);
              if (!src) {
                return <span className="text-text-muted">—</span>;
              }
              return (
                <img
                  src={src}
                  alt=""
                  className="h-9 w-9 rounded-lg border border-border bg-card object-cover"
                />
              );
            },
          },
          { header: "Name", accessor: "name" },
          { header: "Phone", accessor: "phone" },
          {
            header: "Status",
            accessor: (r) =>
              r.is_active === false ? (
                <StatusBadge status="inactive" />
              ) : (
                <StatusBadge status="active" />
              ),
          },
        ]}
        data={rows}
        onRowClick={(r) => {
          void navigate({ to: "/owner/restaurants/$restaurantId", params: { restaurantId: String(r.id) } });
        }}
      />
      <AddRestaurantModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
