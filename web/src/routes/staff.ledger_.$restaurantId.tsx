import { createFileRoute } from "@tanstack/react-router";
import { PartyLedgerDetailView } from "@/components/ledger/PartyLedgerDetailView";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/staff/ledger_/$restaurantId")({
  component: StaffLedgerByRestaurant,
});

function StaffLedgerByRestaurant() {
  const { restaurantId } = Route.useParams();
  const { user } = useAuth();
  const partyId = user != null ? String(user.id) : "";

  if (!/^\d+$/.test(restaurantId)) {
    return <p className="text-sm text-error">Invalid restaurant.</p>;
  }
  const rid = Number(restaurantId);
  if (!Number.isFinite(rid) || rid <= 0) {
    return <p className="text-sm text-error">Invalid restaurant.</p>;
  }
  if (!partyId) return <p className="text-sm text-text-muted">Not signed in.</p>;

  return (
    <>
      <h2 className="mb-4 font-display text-lg font-semibold text-foreground">Ledger</h2>
      <PartyLedgerDetailView
        restaurantId={rid}
        partyType="staff"
        partyId={partyId}
        partyLabel={user?.name ?? "Your ledger"}
        backHref="/staff/ledger"
        canMutate={false}
      />
    </>
  );
}
