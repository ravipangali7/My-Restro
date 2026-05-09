import { createFileRoute } from "@tanstack/react-router";
import { PartyLedgerDetailView } from "@/components/ledger/PartyLedgerDetailView";
import { useAuth } from "@/lib/auth-context";
import { useRestaurantScope } from "@/lib/restaurant-context";

export const Route = createFileRoute("/customer/ledger_/$partyType/$partyId")({
  component: CustomerPartyLedgerPage,
});

function CustomerPartyLedgerPage() {
  const { partyType, partyId } = Route.useParams();
  const { restaurantId } = useRestaurantScope();
  const { user } = useAuth();
  const selfId = user != null ? String(user.id) : "";

  if (restaurantId == null) return <p className="text-sm text-text-muted">No restaurant context.</p>;
  if (!selfId) return <p className="text-sm text-text-muted">Not signed in.</p>;
  if (partyType !== "customer" || partyId !== selfId) {
    return (
      <p className="text-sm text-error">
        You can only view your own customer ledger. Use &quot;Your ledger&quot; from the menu.
      </p>
    );
  }

  return (
    <PartyLedgerDetailView
      restaurantId={restaurantId}
      partyType="customer"
      partyId={selfId}
      partyLabel={user?.name ?? "Your ledger"}
      backHref="/customer/ledger"
      canMutate={false}
    />
  );
}
