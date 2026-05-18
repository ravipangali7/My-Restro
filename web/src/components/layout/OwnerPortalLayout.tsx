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
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">{children}</div>
      </DashboardLayout>
    </PortalGate>
  );
}
