import { createFileRoute, redirect } from "@tanstack/react-router";
import { getStoredAuthUser, useAuth } from "@/lib/auth-context";
import { STAFF_PATH } from "@/lib/portal-routes";
import { useOrders, useStaffMembers } from "@/hooks/use-rest-api";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { useMemo } from "react";
import { KitchenDashboard } from "@/components/staff/KitchenDashboard";
import { WaiterDashboard } from "@/components/staff/WaiterDashboard";

export const Route = createFileRoute("/staff/")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = getStoredAuthUser();
    if (user?.portal_role === "cashier") {
      throw redirect({ to: STAFF_PATH.cashierDashboard, replace: true });
    }
  },
  component: StaffHome,
});

interface OrderSummary {
  id: number;
  order_id: string;
  status: string;
  total?: string | number;
}

function StaffHome() {
  const { userName, role } = useAuth();
  const { restaurantId } = useRestaurantScope();
  const isWaiter = role === "waiter";
  const isKitchen = role === "kitchen";
  const isCashier = role === "cashier";
  const { data: orders = [] } = useOrders(restaurantId);
  const { data: staff = [] } = useStaffMembers(restaurantId, !isWaiter && !isKitchen && !isCashier);

  const orderRows = orders as OrderSummary[];

  const activeOrders = useMemo(
    () => orderRows.filter((o) => ["pending", "accepted", "running"].includes(o.status)),
    [orderRows],
  );

  return (
    <div className="space-y-4">
      <h2 className="font-display font-semibold text-lg text-foreground">Hello, {userName}</h2>
      <p className="text-sm text-text-muted">
        Role: <span className="font-medium text-foreground">{role}</span>
      </p>

      {!isWaiter && !isCashier && !(isKitchen && restaurantId != null) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-text-muted">Active orders</p>
            <p className="text-2xl font-bold text-foreground">{activeOrders.length}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-text-muted">Team size</p>
            <p className="text-2xl font-bold text-foreground">{(staff as unknown[]).length}</p>
          </div>
        </div>
      )}

      {isWaiter && restaurantId == null && (
        <p className="text-sm text-text-muted">No restaurant assigned.</p>
      )}
      {isWaiter && restaurantId != null && <WaiterDashboard />}
      {isKitchen && restaurantId == null && (
        <p className="text-sm text-text-muted">No restaurant assigned.</p>
      )}
      {isKitchen && restaurantId != null && <KitchenDashboard />}
    </div>
  );
}
