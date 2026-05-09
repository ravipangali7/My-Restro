import { createFileRoute } from "@tanstack/react-router";
import { LedgerPartiesHub } from "@/components/ledger/LedgerPartiesHub";
import { useRestaurantScope } from "@/lib/restaurant-context";

export const Route = createFileRoute("/owner/ledger")({ component: LedgerPage });

function LedgerPage() {
  const { restaurantId } = useRestaurantScope();

  if (restaurantId == null) return <p className="text-sm text-text-muted">No restaurant context.</p>;

  return <LedgerPartiesHub restaurantId={restaurantId} portal="owner" />;
}
