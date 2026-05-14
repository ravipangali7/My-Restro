import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PortalGate } from "@/components/auth/PortalGate";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  LayoutDashboard,
  Store,
  UsersRound,
  TrendingUp,
  Wallet,
  ArrowLeftRight,
  Bell,
  Settings,
  User,
} from "lucide-react";

export const Route = createFileRoute("/superadmin")({
  component: SuperAdminLayout,
  head: () => ({
    meta: [
      { title: "Super Admin — My Restro" },
      { name: "description", content: "Platform-wide control panel" },
    ],
  }),
});

const sidebarItems = [
  { title: "Dashboard", to: "/superadmin", icon: LayoutDashboard },
  { title: "Restaurants", to: "/superadmin/restaurants", icon: Store },
  { title: "Users", to: "/superadmin/users", icon: UsersRound },
  { title: "Shareholders", to: "/superadmin/shareholders", icon: TrendingUp },
  { title: "Withdrawals", to: "/superadmin/withdrawals", icon: Wallet },
  { title: "Transactions", to: "/superadmin/transactions", icon: ArrowLeftRight },
  { title: "Notifications", to: "/superadmin/notifications", icon: Bell },
  { title: "Settings", to: "/superadmin/settings", icon: Settings },
];

/** Mobile bottom bar: same five-tab center-hub pattern as owner (`BottomNav` + `featuredIcon="tab"`). */
const bottomTabs = [
  { title: "Home", to: "/superadmin", icon: LayoutDashboard },
  { title: "Restaurants", to: "/superadmin/restaurants", icon: Store },
  { title: "Users", to: "/superadmin/users", icon: UsersRound },
  { title: "Shareholders", to: "/superadmin/shareholders", icon: TrendingUp },
  { title: "Profile", to: "/superadmin/profile", icon: User },
];

function SuperAdminLayout() {
  return (
    <PortalGate allow={["superadmin"]}>
      <DashboardLayout
        title="Super Admin"
        sidebarItems={sidebarItems}
        bottomTabs={bottomTabs}
        bottomNavFeaturedTo="/superadmin/users"
        bottomNavFeaturedIcon="tab"
      >
        <Outlet />
      </DashboardLayout>
    </PortalGate>
  );
}
