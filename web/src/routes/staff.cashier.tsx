import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { CashierDashboard } from "@/components/staff/CashierDashboard";

export const Route = createFileRoute("/staff/cashier")({
  component: StaffCashierDashboardRoute,
});

function StaffCashierDashboardRoute() {
  const { userName } = useAuth();
  const { restaurantId } = useRestaurantScope();

  return (
    <div className="space-y-4">
      <h2 className="font-display font-semibold text-lg text-foreground">Hello, {userName}</h2>
      {restaurantId == null ? (
        <p className="text-sm text-text-muted">No restaurant assigned.</p>
      ) : (
        <CashierDashboard />
      )}
    </div>
  );
}
