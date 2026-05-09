import { createFileRoute, Outlet } from "@tanstack/react-router";
import { OwnerPortalLayout } from "@/components/layout/OwnerPortalLayout";

export const Route = createFileRoute("/owner")({
  component: OwnerLayout,
  head: () => ({
    meta: [
      { title: "Owner Dashboard — My Restro" },
      { name: "description", content: "Restaurant management dashboard" },
    ],
  }),
});

function OwnerLayout() {
  return (
    <OwnerPortalLayout>
      <Outlet />
    </OwnerPortalLayout>
  );
}
