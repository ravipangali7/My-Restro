import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth, type AuthUser } from "@/lib/auth-context";

interface RestaurantScopeValue {
  restaurantId: number | null;
  setRestaurantId: (id: number | null) => void;
  restaurantIds: number[];
}

const RestaurantScopeContext = createContext<RestaurantScopeValue | null>(null);

function staffAssignedRestaurantIds(user: AuthUser): number[] {
  const rows = user.staff_memberships ?? [];
  const ids = rows.filter((m) => !m.is_suspend).map((m) => m.restaurant);
  return [...new Set(ids)];
}

function isStaffRestaurantPortalUser(user: AuthUser | null): boolean {
  if (user?.role === "staff") return true;
  const pr = user?.portal_role;
  return pr === "waiter" || pr === "cashier" || pr === "kitchen";
}

export function RestaurantScopeProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const isStaffUser = isStaffRestaurantPortalUser(user);

  const staffScopeIds = useMemo(() => (user && isStaffUser ? staffAssignedRestaurantIds(user) : []), [user, isStaffUser]);

  const restaurantIds = useMemo(() => {
    if (isStaffUser) return staffScopeIds;
    return user?.restaurant_ids ?? [];
  }, [isStaffUser, staffScopeIds, user?.restaurant_ids]);

  const defaultId = useMemo(() => {
    if (isStaffUser) {
      if (!staffScopeIds.length) return null;
      const d = user?.default_restaurant_id;
      if (d != null && staffScopeIds.includes(d)) return d;
      return staffScopeIds[0] ?? null;
    }
    const fromUser = user?.default_restaurant_id ?? null;
    const ids = user?.restaurant_ids ?? [];
    return fromUser ?? ids[0] ?? null;
  }, [isStaffUser, staffScopeIds, user?.default_restaurant_id, user?.restaurant_ids]);

  const [restaurantId, setRestaurantId] = useState<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      const envId = Number(import.meta.env.VITE_RESTAURANT_ID);
      setRestaurantId(Number.isFinite(envId) && envId > 0 ? envId : null);
      return;
    }
    if (isStaffUser) {
      setRestaurantId((prev) => {
        if (prev != null && staffScopeIds.includes(prev)) return prev;
        if (defaultId != null) return defaultId;
        return staffScopeIds[0] ?? null;
      });
      return;
    }
    setRestaurantId((prev) => {
      if (prev != null && restaurantIds.includes(prev)) return prev;
      if (defaultId != null) return defaultId;
      if (restaurantIds.length) return restaurantIds[0]!;
      const envId = Number(import.meta.env.VITE_RESTAURANT_ID);
      return Number.isFinite(envId) && envId > 0 ? envId : null;
    });
  }, [isAuthenticated, isStaffUser, defaultId, restaurantIds, staffScopeIds]);

  const value = useMemo(
    () => ({
      restaurantId,
      setRestaurantId,
      restaurantIds,
    }),
    [restaurantId, restaurantIds],
  );

  return <RestaurantScopeContext.Provider value={value}>{children}</RestaurantScopeContext.Provider>;
}

export function useRestaurantScope() {
  const ctx = useContext(RestaurantScopeContext);
  if (!ctx) throw new Error("useRestaurantScope must be used within RestaurantScopeProvider");
  return ctx;
}
