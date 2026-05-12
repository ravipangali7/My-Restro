import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { PortalGate } from "@/components/auth/PortalGate";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  LayoutDashboard,
  BookOpen,
  ArrowLeftRight,
  User,
  ShoppingCart,
  ClipboardList,
  AlertTriangle,
  Package,
  Bell,
  Home,
} from "lucide-react";
import { getStoredAuthUser, useAuth } from "@/lib/auth-context";
import type { NavItem } from "@/components/layout/AppSidebar";
import { isStaffPathAllowedForRole, portalHomeByRole, STAFF_PATH, type StaffPortalRole } from "@/lib/portal-routes";
import { KitchenPortalOrderAlarm } from "@/components/staff/KitchenPortalOrderAlarm";

export const Route = createFileRoute("/staff")({
  beforeLoad: ({ location }) => {
    if (typeof window === "undefined") return;
    const user = getStoredAuthUser();
    const role = user?.portal_role;
    if (role !== "waiter" && role !== "cashier" && role !== "kitchen") return;
    if (isStaffPathAllowedForRole(role as StaffPortalRole, location.pathname)) return;
    throw redirect({ to: portalHomeByRole[role], replace: true });
  },
  component: StaffLayout,
  head: () => ({ meta: [{ title: "Staff Portal — My Restro" }] }),
});

function StaffLayout() {
  const { role } = useAuth();
  const staffRole = role as string;

  const baseSidebar: NavItem[] = [
    {
      title: "Dashboard",
      to: staffRole === "cashier" ? STAFF_PATH.cashierDashboard : STAFF_PATH.home,
      icon: LayoutDashboard,
    },
    ...(staffRole === "waiter" ? [{ title: "POS", to: STAFF_PATH.pos, icon: ShoppingCart }] : []),
    { title: "Ledger", to: STAFF_PATH.ledger, icon: BookOpen },
    { title: "Transactions", to: STAFF_PATH.transactions, icon: ArrowLeftRight },
    { title: "Notifications", to: STAFF_PATH.notifications, icon: Bell },
    { title: "Profile", to: STAFF_PATH.profile, icon: User },
  ];

  if (staffRole === "waiter") {
    baseSidebar.splice(2, 0, {
      title: "Waiting Pickup Orders",
      to: STAFF_PATH.waitingPickup,
      icon: Package,
    });
  }
  if (staffRole === "kitchen") {
    baseSidebar.splice(1, 0, { title: "Live Orders", to: STAFF_PATH.liveorders, icon: ClipboardList });
    baseSidebar.splice(2, 0, {
      title: "Waiting Pickup Orders",
      to: STAFF_PATH.waitingPickup,
      icon: Package,
    });
  }
  if (staffRole === "cashier") {
    baseSidebar.splice(1, 0, { title: "Payment alerts", to: STAFF_PATH.paymentAlerts, icon: AlertTriangle });
  }

  /** Cashier mobile bottom bar: same layout pattern as the owner portal (five tabs, center hub). */
  const cashierBottomTabs = [
    { title: "Home", to: STAFF_PATH.cashierDashboard, icon: Home },
    { title: "Transactions", to: STAFF_PATH.transactions, icon: ArrowLeftRight },
    { title: "Alerts", to: STAFF_PATH.paymentAlerts, icon: AlertTriangle },
    { title: "Ledgers", to: STAFF_PATH.ledger, icon: BookOpen },
    { title: "Profile", to: STAFF_PATH.profile, icon: User },
  ];

  /** Waiter mobile bottom bar: five equal tabs, concise labels for small screens. */
  const waiterBottomTabs = [
    { title: "Home", to: STAFF_PATH.home, icon: Home },
    { title: "Pickup", to: STAFF_PATH.waitingPickup, icon: Package },
    { title: "POS", to: STAFF_PATH.pos, icon: ShoppingCart },
    { title: "Ledger", to: STAFF_PATH.ledger, icon: BookOpen },
    { title: "Profile", to: STAFF_PATH.profile, icon: User },
  ];

  const bottomTabs =
    staffRole === "cashier"
      ? cashierBottomTabs
      : staffRole === "waiter"
        ? waiterBottomTabs
        : [
            {
              title: "Dashboard",
              to: STAFF_PATH.home,
              icon: LayoutDashboard,
            },
            { title: "Live Orders", to: STAFF_PATH.liveorders, icon: ClipboardList },
            { title: "Pickup", to: STAFF_PATH.waitingPickup, icon: Package },
            { title: "Profile", to: STAFF_PATH.profile, icon: User },
          ];

  return (
    <PortalGate allow={["waiter", "cashier", "kitchen"]}>
      {staffRole === "kitchen" ? <KitchenPortalOrderAlarm /> : null}
      <DashboardLayout
        title="Staff Portal"
        sidebarItems={baseSidebar}
        bottomTabs={bottomTabs}
        bottomNavFeaturedTo={staffRole === "cashier" ? STAFF_PATH.paymentAlerts : undefined}
        bottomNavFeaturedIcon={staffRole === "cashier" ? "tab" : undefined}
      >
        <Outlet />
      </DashboardLayout>
    </PortalGate>
  );
}
