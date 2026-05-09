import type { ReactNode } from "react";
import type { AuthUser } from "@/lib/auth-context";

export type RestaurantRowExtras = { restaurant?: number; restaurant_name?: string };

/** Owner/staff tables: show a Restaurant column when the user can manage more than one restaurant. */
export function ownerStaffShowsRestaurantColumn(user: AuthUser | null | undefined): boolean {
  return (user?.restaurant_ids?.length ?? 0) > 1;
}

export function restaurantDisplayName(r: RestaurantRowExtras): string {
  return r.restaurant_name ?? (r.restaurant != null ? `Restaurant #${r.restaurant}` : "—");
}

export function restaurantTableColumn<T extends RestaurantRowExtras>(): {
  header: string;
  accessor: (row: T) => ReactNode;
} {
  return {
    header: "Restaurant",
    accessor: (row) => (
      <span className="text-sm text-foreground">{restaurantDisplayName(row as RestaurantRowExtras)}</span>
    ),
  };
}
