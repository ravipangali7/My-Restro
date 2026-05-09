import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useEffect } from "react";
import { portalHomeByRole } from "@/lib/portal-routes";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "My Restro — Restaurant Management Ecosystem" },
      {
        name: "description",
        content: "Complete restaurant management platform for owners, staff, customers, and shareholders.",
      },
    ],
  }),
});

function Index() {
  const { isAuthenticated, user, isHydrated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isHydrated) return;
    if (isAuthenticated && user) {
      navigate({ to: portalHomeByRole[user.portal_role] ?? "/login" });
    } else {
      navigate({ to: "/login" });
    }
  }, [isHydrated, isAuthenticated, user, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-display font-bold animate-pulse">
        MR
      </div>
    </div>
  );
}
