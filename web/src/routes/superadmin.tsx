import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PortalGate } from "@/components/auth/PortalGate";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  LayoutDashboard, Store, UsersRound, TrendingUp, Wallet,
  ArrowLeftRight, Bell, Settings
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

const bottomTabs = [
  { title: "Dashboard", to: "/superadmin", icon: LayoutDashboard },
  { title: "Restaurants", to: "/superadmin/restaurants", icon: Store },
  { title: "Users", to: "/superadmin/users", icon: UsersRound },
  { title: "Settings", to: "/superadmin/settings", icon: Settings },
];

function SuperAdminLayout() {
  return (
    <PortalGate allow={["superadmin"]}>
      <DashboardLayout title="Super Admin" sidebarItems={sidebarItems} bottomTabs={bottomTabs}>
        <Outlet />
      </DashboardLayout>
    </PortalGate>
  );
}
