import { createFileRoute } from "@tanstack/react-router";
import { LedgerPartiesHub } from "@/components/ledger/LedgerPartiesHub";
import { PersonalLedgerRestaurantPicker } from "@/components/ledger/PersonalLedgerRestaurantPicker";
import { useAuth } from "@/lib/auth-context";
import { useRestaurantScope } from "@/lib/restaurant-context";

export const Route = createFileRoute("/staff/ledger")({ component: StaffLedger });

function StaffLedger() {
  const { role } = useAuth();
  const { restaurantId } = useRestaurantScope();

  if (restaurantId == null) return <p className="text-sm text-text-muted">No restaurant context.</p>;

  if (role === "cashier") {
    return <LedgerPartiesHub restaurantId={restaurantId} portal="staff" />;
  }

  return <PersonalLedgerRestaurantPicker mode="staff" />;
}
