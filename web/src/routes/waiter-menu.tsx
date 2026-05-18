import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useClientHome } from "@/hooks/use-rest-api";

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
    meta: [{ title: "Menu — My Restro" }],
  }),
  component: WaiterMenuRedirectPage,
});

function WaiterMenuRedirectPage() {
  const { restaurantId } = Route.useSearch();
  const navigate = useNavigate();
  const id = restaurantId != null && restaurantId > 0 ? restaurantId : null;
  const { data, isLoading, error } = useClientHome(id);

  const slug =
    data && typeof data === "object" && data !== null && "restaurant" in data
      ? (data as { restaurant?: { slug?: string } }).restaurant?.slug
      : undefined;

  useEffect(() => {
    if (!slug?.trim()) return;
    void navigate({
      to: "/menu/$restaurantSlug",
      params: { restaurantSlug: slug.trim() },
      replace: true,
    });
  }, [slug, navigate]);

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

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4">
        <p className="text-sm text-text-muted">Redirecting to menu…</p>
      </div>
    );
  }

  if (error || !slug?.trim()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4">
        <p className="max-w-md text-center text-sm text-text-muted">
          {error instanceof Error ? error.message : "Could not open this menu link."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <p className="text-sm text-text-muted">Redirecting to menu…</p>
    </div>
  );
}
