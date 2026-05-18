import { createFileRoute } from "@tanstack/react-router";
import { MenuQrPage } from "@/components/shared/MenuQrPage";
import { useRestaurants } from "@/hooks/use-rest-api";
import { resolveMediaUrl } from "@/lib/api";
import { useRestaurantScope } from "@/lib/restaurant-context";

export const Route = createFileRoute("/owner/menu-qr")({
  validateSearch: (search: Record<string, unknown>) => ({
    restaurantId:
      typeof search.restaurantId === "number"
        ? search.restaurantId
        : typeof search.restaurantId === "string" && Number.isFinite(Number(search.restaurantId))
          ? Number(search.restaurantId)
          : undefined,
  }),
  component: OwnerMenuQrRoute,
});

function OwnerMenuQrRoute() {
  const { restaurantId: scopeRestaurantId } = useRestaurantScope();
  const { restaurantId: searchRestaurantId } = Route.useSearch();
  const { data: restaurants = [] } = useRestaurants();

  const selectedRestaurantId = searchRestaurantId ?? scopeRestaurantId ?? null;
  const selectedRestaurant = (
    restaurants as { id: number; name?: string; slug?: string; logo?: string | null }[]
  ).find((r) => r.id === selectedRestaurantId);

  return (
    <MenuQrPage
      title="Menu QR"
      subtitle="Generate and share a QR that opens the restaurant menu in the browser so guests can order with name and phone—no account required."
      backTo="/owner/restaurants"
      backLabel="Back to Restaurants"
      restaurantId={selectedRestaurantId}
      restaurantSlug={selectedRestaurant?.slug}
      restaurantName={selectedRestaurant?.name}
      restaurantLogoUrl={resolveMediaUrl(selectedRestaurant?.logo)}
    />
  );
}
