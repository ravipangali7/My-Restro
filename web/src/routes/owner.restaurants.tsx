import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AddRestaurantModal } from "@/components/owner/AddRestaurantModal";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useRestaurants } from "@/hooks/use-rest-api";
import { resolveMediaUrl } from "@/lib/api";
import { Eye, Plus } from "lucide-react";

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
            header: "Image",
            accessor: (r: RestaurantRow) => {
              const src = resolveMediaUrl(r.logo);
              if (!src) {
                return <span className="text-text-muted">—</span>;
              }
              return (
                <img
                  src={src}
                  alt=""
                  className="w-9 h-9 rounded-lg object-cover border border-border bg-card"
                />
              );
            },
          },
          { header: "Name", accessor: "name" },
          { header: "Phone", accessor: "phone" },
          {
            header: "Slug",
            accessor: (r) => (r.slug ? String(r.slug) : "—"),
          },
          {
            header: "Status",
            accessor: (r) =>
              r.is_active === false ? (
                <StatusBadge status="inactive" />
              ) : (
                <StatusBadge status="active" />
              ),
          },
          {
            header: "Main coordinates",
            accessor: (r: RestaurantRow) =>
              r.latitude != null && r.longitude != null
                ? `${Number(r.latitude).toFixed(5)}, ${Number(r.longitude).toFixed(5)}`
                : "—",
          },
          {
            header: "Reference pin",
            accessor: (r: RestaurantRow) =>
              r.reference_latitude != null && r.reference_longitude != null
                ? `${Number(r.reference_latitude).toFixed(5)}, ${Number(r.reference_longitude).toFixed(5)}`
                : "—",
          },
          {
            header: "Pin distance",
            accessor: (r: RestaurantRow) =>
              r.reference_distance_m != null ? `${r.reference_distance_m.toFixed(1)} m` : "—",
          },
          {
            header: "Alert radius",
            accessor: (r: RestaurantRow) => `${Number(r.proximity_alert_radius_m)} m`,
          },
          {
            header: "Delivery radius",
            accessor: (r: RestaurantRow) =>
              r.delivery_radius_km != null ? `${Number(r.delivery_radius_km).toLocaleString()} km` : "—",
          },
          {
            header: "Action",
            accessor: (r: RestaurantRow) => (
              <Link
                to="/owner/restaurants/$restaurantId"
                params={{ restaurantId: String(r.id) }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-foreground hover:bg-muted"
                title="View restaurant details"
                aria-label={`View details for ${r.name}`}
              >
                <Eye size={16} strokeWidth={2.25} aria-hidden />
              </Link>
            ),
          },
        ]}
        data={rows as Record<string, unknown>[]}
      />
      <AddRestaurantModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
