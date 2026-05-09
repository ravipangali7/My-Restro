import { createFileRoute } from "@tanstack/react-router";
import { OwnerPortalLayout } from "@/components/layout/OwnerPortalLayout";
import { OwnerHomeDashboard } from "@/components/owner/OwnerHomeDashboard";

export const Route = createFileRoute("/dashboard")({
  component: OwnerDashboardRoute,
  head: () => ({
    meta: [
      { title: "Owner Dashboard — My Restro" },
      { name: "description", content: "Restaurant management dashboard" },
    ],
  }),
});

function OwnerDashboardRoute() {
  return (
    <OwnerPortalLayout>
      <OwnerHomeDashboard />
    </OwnerPortalLayout>
  );
}
