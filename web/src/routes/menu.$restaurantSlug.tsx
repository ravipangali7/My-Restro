import { createFileRoute } from "@tanstack/react-router";
import { StaffPosView } from "@/components/staff/StaffPosView";
import { useClientHomeBySlug } from "@/hooks/use-rest-api";

export const Route = createFileRoute("/menu/$restaurantSlug")({
  head: ({ params }) => ({
    meta: [{ title: `${params.restaurantSlug} — Menu` }],
  }),
  component: PublicMenuPage,
});

function PublicMenuPage() {
  const { restaurantSlug } = Route.useParams();
  const slug = restaurantSlug?.trim() ?? "";
  const { data, isLoading, error } = useClientHomeBySlug(slug || null);
  const restaurantId =
    data && typeof data === "object" && data !== null && "restaurant" in data
      ? (data as { restaurant?: { id?: number } }).restaurant?.id ?? null
      : null;

  if (!slug) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4">
        <p className="max-w-md text-center text-sm text-text-muted">This menu link is invalid.</p>
      </div>
    );
  }

  if (isLoading && restaurantId == null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4">
        <p className="text-sm text-text-muted">Loading menu…</p>
      </div>
    );
  }

  if (error && restaurantId == null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4">
        <p className="max-w-md text-center text-sm text-text-muted">
          {error instanceof Error ? error.message : "This restaurant menu could not be loaded."}
        </p>
      </div>
    );
  }

  return <StaffPosView restaurantId={restaurantId} mode="public" />;
}
