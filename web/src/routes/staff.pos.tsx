import { createFileRoute } from "@tanstack/react-router";
import { StaffPosView } from "@/components/staff/StaffPosView";
import { useRestaurantScope } from "@/lib/restaurant-context";

export const Route = createFileRoute("/staff/pos")({
  component: StaffPosRoute,
});

function StaffPosRoute() {
  const { restaurantId } = useRestaurantScope();
  return <StaffPosView restaurantId={restaurantId} mode="staff" />;
}
