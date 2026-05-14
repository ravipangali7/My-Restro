import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PortalGate } from "@/components/auth/PortalGate";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { LayoutDashboard, Wallet, ArrowLeftRight, User, Bell } from "lucide-react";

export const Route = createFileRoute("/shareholder")({
  component: ShareholderLayout,
  head: () => ({ meta: [{ title: "Shareholder Portal — My Restro" }] }),
});

const sidebarItems = [
  { title: "Dashboard", to: "/shareholder", icon: LayoutDashboard },
  { title: "Withdrawals", to: "/shareholder/withdrawals", icon: Wallet },
  { title: "Transactions", to: "/shareholder/transactions", icon: ArrowLeftRight },
  { title: "Notifications", to: "/shareholder/notifications", icon: Bell },
  { title: "Profile", to: "/shareholder/profile", icon: User },
];

/** Mobile bottom bar: same hub pattern as owner portal (five tabs, center elevated). Icons unchanged from prior shareholder tabs. */
const bottomTabs = [
  { title: "Home", to: "/shareholder", icon: LayoutDashboard },
  { title: "Transactions", to: "/shareholder/transactions", icon: ArrowLeftRight },
  { title: "Withdrawals", to: "/shareholder/withdrawals", icon: Wallet },
  { title: "Notifications", to: "/shareholder/notifications", icon: Bell },
  { title: "Profile", to: "/shareholder/profile", icon: User },
];

const shareholderBottomNavFeaturedTo = "/shareholder/withdrawals" as const;

function ShareholderLayout() {
  return (
    <PortalGate allow={["shareholder"]}>
      <DashboardLayout
        title="Shareholder Portal"
        sidebarItems={sidebarItems}
        bottomTabs={bottomTabs}
        bottomNavFeaturedTo={shareholderBottomNavFeaturedTo}
        bottomNavFeaturedIcon="tab"
      >
        <Outlet />
      </DashboardLayout>
    </PortalGate>
  );
}
