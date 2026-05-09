import { defaultStringifySearch, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useAuth, type PortalRole } from "@/lib/auth-context";
import { portalHomeByRole } from "@/lib/portal-routes";

export function PortalGate({
  allow,
  children,
  allowGuest = false,
}: {
  allow: PortalRole[];
  children: ReactNode;
  allowGuest?: boolean;
}) {
  const { isHydrated, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const searchPart = defaultStringifySearch(location.search);
  const pr = user?.portal_role ?? null;
  const canAccessAsGuest = allowGuest && !isAuthenticated;

  useEffect(() => {
    if (!isHydrated) return;
    if (canAccessAsGuest) return;
    if (!isAuthenticated) {
      const returnTo = `${location.pathname}${searchPart}`;
      navigate({ to: "/login", search: { redirect: returnTo }, replace: true });
      return;
    }
    if (!pr || !allow.includes(pr)) {
      const home = pr ? portalHomeByRole[pr] : "/";
      navigate({ to: home, replace: true });
    }
  }, [isHydrated, isAuthenticated, pr, allow, navigate, location.pathname, searchPart, canAccessAsGuest]);

  if (!isHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-display font-bold animate-pulse">
          MR
        </div>
      </div>
    );
  }

  if (canAccessAsGuest) {
    return <>{children}</>;
  }

  if (!isAuthenticated || !pr || !allow.includes(pr)) {
    return null;
  }

  return <>{children}</>;
}
