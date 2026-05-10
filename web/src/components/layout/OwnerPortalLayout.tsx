import { type ReactNode } from "react";
import { PortalGate } from "@/components/auth/PortalGate";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ownerBottomNavFeaturedTo, ownerBottomTabs, ownerSidebarItems } from "@/lib/owner-nav";

export function OwnerPortalLayout({ children }: { children: ReactNode }) {
  return (
    <PortalGate allow={["owner"]}>
      <DashboardLayout
        title="Owner Dashboard"
        sidebarItems={ownerSidebarItems}
        bottomTabs={ownerBottomTabs}
        bottomNavFeaturedTo={ownerBottomNavFeaturedTo}
        bottomNavFeaturedIcon="tab"
      >
        {children}
      </DashboardLayout>
    </PortalGate>
  );
}
