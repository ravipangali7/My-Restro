import { useMemo } from "react";
import { useOrders } from "@/hooks/use-rest-api";
import { useKitchenPendingOrderAlarm } from "@/hooks/use-kitchen-order-alarm";
import { useAuth } from "@/lib/auth-context";
import { useRestaurantScope } from "@/lib/restaurant-context";

const KITCHEN_ORDER_POLL_MS = 5000;

/**
 * Subscribes to orders while the kitchen staff portal is open so new pending orders
 * trigger an audible alarm on any staff route (dashboard, live orders, waiting pickup, …).
 */
export function KitchenPortalOrderAlarm() {
  const { role } = useAuth();
  const { restaurantId } = useRestaurantScope();
  const { data } = useOrders(restaurantId, { refetchInterval: KITCHEN_ORDER_POLL_MS });

  const orderSnapshots = useMemo(() => {
    if (!Array.isArray(data)) return undefined;
    return data
      .filter(
        (o): o is { id: number; status: string } =>
          typeof o === "object" &&
          o !== null &&
          "id" in o &&
          typeof (o as { id: unknown }).id === "number" &&
          "status" in o,
      )
      .map((o) => ({ id: o.id, status: String(o.status) }));
  }, [data]);

  useKitchenPendingOrderAlarm(orderSnapshots, role === "kitchen", restaurantId);

  return null;
}
