import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PortalGate } from "@/components/auth/PortalGate";
import { BottomNav } from "@/components/layout/BottomNav";
import { PortalNotificationBell } from "@/components/layout/StaffNotificationBell";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCustomerCartBadgeCount } from "@/hooks/use-customer-cart-badge";
import { useAuth } from "@/lib/auth-context";
import {
  CUSTOMER_BOTTOM_NAV_ITEMS,
  CUSTOMER_DRAWER_NAV_ITEMS,
  CUSTOMER_PROFILE_MENU_LINKS,
} from "@/lib/customer-portal-nav";
import { ChevronRight, Edit, Menu, ShoppingCart } from "lucide-react";

export const Route = createFileRoute("/customer")({
  component: CustomerLayout,
  head: () => ({
    meta: [{ title: "Customer — My Restro" }],
  }),
});

function CustomerLayout() {
  const navigate = useNavigate();
  const { isAuthenticated, logout } = useAuth();
  const cartBadgeCount = useCustomerCartBadgeCount();
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  return (
    <PortalGate allow={["customer"]} allowGuest>
      <div className="min-h-screen bg-surface pb-20">
        <div className="sticky top-0 z-30 flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-card/95 backdrop-blur-sm">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-foreground hover:bg-surface-alt transition-colors shrink-0"
              aria-label="Open navigation menu"
            >
              <Menu size={22} strokeWidth={2} aria-hidden />
            </button>
            <SheetContent side="left" className="flex w-[min(100%,20rem)] flex-col gap-0 overflow-y-auto p-0 pt-12 sm:max-w-sm">
              <SheetHeader className="border-b border-border px-4 pb-4 text-left">
                <SheetTitle className="font-display text-left text-base">Menu</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col px-2 py-3" aria-label="Main navigation">
                {CUSTOMER_DRAWER_NAV_ITEMS.map((item) => {
                  const badge = item.to === "/customer/cart" && cartBadgeCount > 0 ? cartBadgeCount : null;
                  return (
                    <SheetClose asChild key={item.to}>
                      <Link
                        to={item.to}
                        className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-foreground hover:bg-surface-alt transition-colors"
                      >
                        <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <item.icon size={18} aria-hidden />
                          {badge != null ? (
                            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground tabular-nums">
                              {badge > 99 ? "99+" : badge}
                            </span>
                          ) : null}
                        </span>
                        <span className="flex-1 text-left">{item.title}</span>
                        <ChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden />
                      </Link>
                    </SheetClose>
                  );
                })}
              </nav>
              <div className="mx-2 border-t border-border" />
              <div className="px-4 pb-2 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Profile</p>
              </div>
              <nav className="flex flex-col px-2 pb-4" aria-label="Profile shortcuts">
                <SheetClose asChild>
                  <Link
                    to="/customer/profile"
                    className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-foreground hover:bg-surface-alt transition-colors"
                  >
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Edit size={18} aria-hidden />
                    </span>
                    <span className="flex-1 text-left">Edit profile</span>
                    <ChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden />
                  </Link>
                </SheetClose>
                {CUSTOMER_PROFILE_MENU_LINKS.map((item) => (
                  <SheetClose asChild key={`profile-${item.to}-${item.title}`}>
                    <Link
                      to={item.to}
                      className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-foreground hover:bg-surface-alt transition-colors"
                    >
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <item.icon size={18} aria-hidden />
                      </span>
                      <span className="flex-1 text-left">{item.title}</span>
                      <ChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden />
                    </Link>
                  </SheetClose>
                ))}
              </nav>
              <div className="mt-auto border-t border-border p-4">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setLogoutConfirmOpen(true);
                  }}
                  className="w-full rounded-xl border border-error/40 bg-error/10 py-3 text-sm font-semibold text-error hover:bg-error/15 transition-colors"
                >
                  Logout
                </button>
              </div>
            </SheetContent>
          </Sheet>
          <div className="flex flex-1 justify-end items-center gap-1 min-w-0 sm:gap-2">
            <Link
              to="/customer/cart"
              className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-surface-alt"
              aria-label={cartBadgeCount > 0 ? `Cart, ${cartBadgeCount} items` : "Cart"}
            >
              <ShoppingCart size={22} strokeWidth={2} aria-hidden />
              {cartBadgeCount > 0 ? (
                <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground tabular-nums">
                  {cartBadgeCount > 99 ? "99+" : cartBadgeCount}
                </span>
              ) : null}
            </Link>
            {isAuthenticated ? <PortalNotificationBell /> : null}
          </div>
        </div>
        <Outlet />
        <BottomNav tabs={CUSTOMER_BOTTOM_NAV_ITEMS} featuredTo="/customer/orders" />
      </div>
      <ConfirmModal
        open={logoutConfirmOpen}
        title="Logout"
        message="Are you sure you want to logout?"
        confirmLabel="Logout"
        variant="danger"
        onConfirm={() => {
          setLogoutConfirmOpen(false);
          void logout().then(() => {
            navigate({ to: "/login", replace: true });
          });
        }}
        onCancel={() => setLogoutConfirmOpen(false)}
      />
    </PortalGate>
  );
}
