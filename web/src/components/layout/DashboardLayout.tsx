import { type ReactNode, useCallback, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { AppSidebar, type NavItem } from "./AppSidebar";
import { TopAppBar } from "./TopAppBar";
import { BottomNav } from "./BottomNav";
import { MOBILE_NAV_ID, MobileNavDrawer } from "./MobileNavDrawer";
import { useAuth } from "@/lib/auth-context";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { cn } from "@/lib/utils";

interface BottomTab {
  title: string;
  to: string;
  icon: LucideIcon;
}

interface DashboardLayoutProps {
  children: ReactNode;
  title: string;
  sidebarItems: NavItem[];
  bottomTabs?: BottomTab[];
  /** When set, that tab uses the elevated center hub (see `BottomNav` featured treatment). */
  bottomNavFeaturedTo?: string;
  bottomNavFeaturedIcon?: "hub" | "tab";
}

export function DashboardLayout({
  children,
  title,
  sidebarItems,
  bottomTabs,
  bottomNavFeaturedTo,
  bottomNavFeaturedIcon,
}: DashboardLayoutProps) {
  const { logout } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);
  const toggleMobileNav = useCallback(() => setMobileNavOpen((v) => !v), []);
  const requestLogout = useCallback(() => setLogoutConfirmOpen(true), []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onWide = () => {
      if (mq.matches) setMobileNavOpen(false);
    };
    mq.addEventListener("change", onWide);
    return () => mq.removeEventListener("change", onWide);
  }, []);

  return (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-surface">
      <AppSidebar items={sidebarItems} onLogout={requestLogout} />
      <MobileNavDrawer
        open={mobileNavOpen}
        onClose={closeMobileNav}
        items={sidebarItems}
        onLogout={requestLogout}
        brandTitle={title}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TopAppBar
          title={title}
          showMobileMenu
          onMenuToggle={toggleMobileNav}
          mobileMenuExpanded={mobileNavOpen}
          mobileMenuControlsId={MOBILE_NAV_ID}
        />
        <main
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain scroll-smooth p-4 lg:p-6",
            bottomTabs != null && bottomTabs.length > 0
              ? "max-lg:pb-[var(--app-mobile-bottom-nav-scroll-padding)] lg:pb-6"
              : undefined,
          )}
        >
          {children}
        </main>
      </div>
      {bottomTabs && (
        <BottomNav tabs={bottomTabs} featuredTo={bottomNavFeaturedTo} featuredIcon={bottomNavFeaturedIcon} />
      )}
      <ConfirmModal
        open={logoutConfirmOpen}
        title="Logout"
        message="Are you sure you want to logout?"
        confirmLabel="Logout"
        variant="danger"
        onConfirm={() => {
          setLogoutConfirmOpen(false);
          void logout();
        }}
        onCancel={() => setLogoutConfirmOpen(false)}
      />
    </div>
  );
}
