import { createFileRoute } from "@tanstack/react-router";
import { PaymentAlertsBoard } from "@/components/staff/PaymentAlertsBoard";
import { useRestaurantScope } from "@/lib/restaurant-context";

export const Route = createFileRoute("/staff/payment-alerts")({
  component: StaffPaymentAlertsPage,
});

function StaffPaymentAlertsPage() {
  const { restaurantId } = useRestaurantScope();

  if (restaurantId == null) {
    return <p className="text-sm text-text-muted p-4">No restaurant context.</p>;
  }

  return <PaymentAlertsBoard restaurantId={restaurantId} />;
}
