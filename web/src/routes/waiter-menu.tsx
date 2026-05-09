import { createFileRoute } from "@tanstack/react-router";
import { StaffPosView } from "@/components/staff/StaffPosView";

export const Route = createFileRoute("/waiter-menu")({
  validateSearch: (search: Record<string, unknown>) => ({
    restaurantId:
      typeof search.restaurantId === "number"
        ? search.restaurantId
        : typeof search.restaurantId === "string" && Number.isFinite(Number(search.restaurantId))
          ? Number(search.restaurantId)
          : undefined,
  }),
  head: () => ({
    meta: [{ title: "Waiter menu — My Restro" }],
  }),
  component: WaiterMenuPage,
});

function WaiterMenuPage() {
  const { restaurantId } = Route.useSearch();
  const id = restaurantId != null && restaurantId > 0 ? restaurantId : null;

  if (id == null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4">
        <p className="max-w-md text-center text-sm text-text-muted">
          This link is missing a valid <span className="font-mono text-foreground">restaurantId</span>. Ask your team
          for the full menu QR link from the owner or staff portal.
        </p>
      </div>
    );
  }

  return <StaffPosView restaurantId={id} mode="public" />;
}
