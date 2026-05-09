import { useState } from "react";
import { Bell, Menu, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Link } from "@tanstack/react-router";
import { resolveMediaUrl } from "@/lib/api";
import { PortalNotificationBell } from "@/components/layout/StaffNotificationBell";
import { ConfirmModal } from "@/components/shared/ConfirmModal";

interface TopAppBarProps {
  title: string;
  onMenuToggle?: () => void;
  showMobileMenu?: boolean;
  mobileMenuExpanded?: boolean;
  mobileMenuControlsId?: string;
}

export function TopAppBar({
  title,
  onMenuToggle,
  showMobileMenu = false,
  mobileMenuExpanded = false,
  mobileMenuControlsId,
}: TopAppBarProps) {
  const { userName, role, logout, user } = useAuth();
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const headerAvatarUrl = resolveMediaUrl(user?.image ?? null);
  const showsPortalBell =
    role === "owner" ||
    role === "waiter" ||
    role === "cashier" ||
    role === "kitchen" ||
    role === "shareholder";

  const superAdminNotificationsTo = "/superadmin/notifications" as const;
  const superAdminProfileTo = "/superadmin/profile" as const;

  return (
    <>
    <header className="h-14 bg-card border-b border-border flex items-center px-4 gap-3 shrink-0 z-40">
      {showMobileMenu && (
        <button
          type="button"
          onClick={onMenuToggle}
          className="lg:hidden text-text-secondary rounded-lg border border-border p-1.5 hover:bg-accent/60 transition-colors"
          aria-label={mobileMenuExpanded ? "Close menu" : "Open menu"}
          aria-expanded={mobileMenuExpanded}
          aria-controls={mobileMenuControlsId}
        >
          <Menu size={22} />
        </button>
      )}
      <h1 className="font-display font-bold text-md text-foreground lg:text-lg truncate">{title}</h1>
      <div className="ml-auto flex items-center gap-3">
        {role === "superadmin" ? (
          <Link
            to={superAdminNotificationsTo}
            title="Notifications"
            className="relative text-text-secondary hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded-md p-0.5"
            aria-label="Notifications"
          >
            <Bell size={20} />
          </Link>
        ) : showsPortalBell ? (
          <PortalNotificationBell />
        ) : (
          <span className="relative text-text-muted p-0.5" aria-hidden>
            <Bell size={20} />
          </span>
        )}
        {role === "owner" ? (
          <Link
            to="/owner/profile"
            title="Profile"
            className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 -mr-1 hover:bg-accent/60 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            {headerAvatarUrl ? (
              <img
                src={headerAvatarUrl}
                alt=""
                className="w-8 h-8 rounded-full object-cover shrink-0 border border-border"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-display font-semibold text-sm shrink-0">
                {userName?.[0]?.toUpperCase() || "U"}
              </div>
            )}
            <div className="hidden md:block min-w-0">
              <p className="text-sm font-medium text-foreground leading-tight truncate">{userName || "User"}</p>
              <p className="text-xs text-text-muted capitalize">{role}</p>
            </div>
          </Link>
        ) : role === "superadmin" ? (
          <Link
            to={superAdminProfileTo}
            title="Profile"
            className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 -mr-1 hover:bg-accent/60 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            {headerAvatarUrl ? (
              <img
                src={headerAvatarUrl}
                alt=""
                className="w-8 h-8 rounded-full object-cover shrink-0 border border-border"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-display font-semibold text-sm shrink-0">
                {userName?.[0]?.toUpperCase() || "U"}
              </div>
            )}
            <div className="hidden md:block min-w-0">
              <p className="text-sm font-medium text-foreground leading-tight truncate">{userName || "User"}</p>
              <p className="text-xs text-text-muted capitalize">{role}</p>
            </div>
          </Link>
        ) : role === "waiter" || role === "cashier" || role === "kitchen" ? (
          <Link
            to="/staff/profile"
            title="Profile"
            className="hidden sm:flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 -mr-1 hover:bg-accent/60 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            {headerAvatarUrl ? (
              <img
                src={headerAvatarUrl}
                alt=""
                className="w-8 h-8 rounded-full object-cover shrink-0 border border-border"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-display font-semibold text-sm shrink-0">
                {userName?.[0]?.toUpperCase() || "U"}
              </div>
            )}
            <div className="hidden md:block min-w-0">
              <p className="text-sm font-medium text-foreground leading-tight truncate">{userName || "User"}</p>
              <p className="text-xs text-text-muted capitalize">{role}</p>
            </div>
          </Link>
        ) : (
          <div className="hidden sm:flex items-center gap-2">
            {headerAvatarUrl ? (
              <img
                src={headerAvatarUrl}
                alt=""
                className="w-8 h-8 rounded-full object-cover shrink-0 border border-border"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-display font-semibold text-sm shrink-0">
                {userName?.[0]?.toUpperCase() || "U"}
              </div>
            )}
            <div className="hidden md:block">
              <p className="text-sm font-medium text-foreground leading-tight">{userName || "User"}</p>
              <p className="text-xs text-text-muted capitalize">{role}</p>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setLogoutConfirmOpen(true)}
          className="text-text-muted hover:text-destructive lg:hidden"
          aria-label="Logout"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
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
    </>
  );
}
