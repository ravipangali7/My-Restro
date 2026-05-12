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
  ChefHat,
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

  /**
   * Waiter mobile bottom bar: same hub pattern as cashier (five tabs, center elevated with tab icon).
   * Order mirrors cashier: outer Home/Profile, inner flankers, center hub = POS (ShoppingCart).
   */
  const waiterBottomTabs = [
    { title: "Home", to: STAFF_PATH.home, icon: Home },
    { title: "Pickup", to: STAFF_PATH.waitingPickup, icon: Package },
    { title: "POS", to: STAFF_PATH.pos, icon: ShoppingCart },
    { title: "Ledger", to: STAFF_PATH.ledger, icon: BookOpen },
    { title: "Profile", to: STAFF_PATH.profile, icon: User },
  ];

  /**
   * Kitchen mobile bottom bar: same five-tab hub pattern as waiter/cashier (center elevated).
   * Center hub = Live Orders (`ChefHat` reads as kitchen station vs waiter POS cart).
   */
  const kitchenBottomTabs = [
    { title: "Home", to: STAFF_PATH.home, icon: Home },
    { title: "Pickup", to: STAFF_PATH.waitingPickup, icon: Package },
    { title: "Live Orders", to: STAFF_PATH.liveorders, icon: ChefHat },
    { title: "Ledgers", to: STAFF_PATH.ledger, icon: BookOpen },
    { title: "Profile", to: STAFF_PATH.profile, icon: User },
  ];

  const bottomTabs =
    staffRole === "cashier"
      ? cashierBottomTabs
      : staffRole === "waiter"
        ? waiterBottomTabs
        : kitchenBottomTabs;

  return (
    <PortalGate allow={["waiter", "cashier", "kitchen"]}>
      {staffRole === "kitchen" ? <KitchenPortalOrderAlarm /> : null}
      <DashboardLayout
        title="Staff Portal"
        sidebarItems={baseSidebar}
        bottomTabs={bottomTabs}
        bottomNavFeaturedTo={
          staffRole === "cashier"
            ? STAFF_PATH.paymentAlerts
            : staffRole === "waiter"
              ? STAFF_PATH.pos
              : staffRole === "kitchen"
                ? STAFF_PATH.liveorders
                : undefined
        }
        bottomNavFeaturedIcon={
          staffRole === "cashier" || staffRole === "waiter" || staffRole === "kitchen" ? "tab" : undefined
        }
      >
        <Outlet />
      </DashboardLayout>
    </PortalGate>
  );
}
