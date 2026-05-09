import { createFileRoute } from "@tanstack/react-router";
import { MenuQrPage } from "@/components/shared/MenuQrPage";
import { useRestaurants } from "@/hooks/use-rest-api";
import { resolveMediaUrl } from "@/lib/api";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { STAFF_PATH } from "@/lib/portal-routes";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/staff/menu-qr")({
  component: StaffMenuQrRoute,
});

function StaffMenuQrRoute() {
  const { role } = useAuth();
  const { restaurantId } = useRestaurantScope();
  const { data: restaurants = [] } = useRestaurants();
  const selectedRestaurant = (restaurants as { id: number; name?: string; logo?: string | null }[]).find(
    (r) => r.id === restaurantId,
  );

  return (
    <MenuQrPage
      title="Menu QR"
      subtitle="Use this QR in dine-in areas so waiters can open the same POS-style menu in a browser without logging in."
      backTo={role === "cashier" ? STAFF_PATH.cashierDashboard : STAFF_PATH.home}
      backLabel="Back to Dashboard"
      restaurantId={restaurantId ?? null}
      restaurantName={selectedRestaurant?.name}
      restaurantLogoUrl={resolveMediaUrl(selectedRestaurant?.logo)}
    />
  );
}
