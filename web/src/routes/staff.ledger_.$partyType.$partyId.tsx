import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { PartyLedgerDetailView } from "@/components/ledger/PartyLedgerDetailView";
import { useCustomers, useStaffMembers, useSuppliers } from "@/hooks/use-rest-api";
import { useRestaurantScope } from "@/lib/restaurant-context";

export const Route = createFileRoute("/staff/ledger_/$partyType/$partyId")({
  component: CashierPartyLedgerPage,
});

function CashierPartyLedgerPage() {
  const { partyType, partyId } = Route.useParams();
  const { restaurantId } = useRestaurantScope();
  const { data: customers } = useCustomers(restaurantId);
  const { data: suppliers } = useSuppliers(restaurantId);
  const { data: staff } = useStaffMembers(restaurantId);

  const partyLabel = useMemo(() => {
    if (partyType === "supplier") {
      const s = (suppliers as { id: number; name: string }[] | undefined)?.find((x) => String(x.id) === partyId);
      return s?.name;
    }
    if (partyType === "customer") {
      const c = (customers as { id: number; name?: string; phone?: string }[] | undefined)?.find(
        (x) => String(x.id) === partyId,
      );
      return c?.name || c?.phone;
    }
    if (partyType === "staff") {
      const m = (staff as { user: number; user_name?: string; user_phone?: string }[] | undefined)?.find(
        (x) => String(x.user) === partyId,
      );
      return m?.user_name || m?.user_phone || `User #${partyId}`;
    }
    return undefined;
  }, [partyType, partyId, customers, suppliers, staff]);

  if (restaurantId == null) return <p className="text-sm text-text-muted">No restaurant context.</p>;

  return (
    <PartyLedgerDetailView
      restaurantId={restaurantId}
      partyType={partyType}
      partyId={partyId}
      partyLabel={partyLabel ?? partyId}
      backHref="/staff/ledger"
      canMutate
    />
  );
}
