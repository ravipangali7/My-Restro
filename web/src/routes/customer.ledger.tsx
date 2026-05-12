import { createFileRoute } from "@tanstack/react-router";
import { PersonalLedgerRestaurantPicker } from "@/components/ledger/PersonalLedgerRestaurantPicker";

export const Route = createFileRoute("/customer/ledger")({
  component: CustomerLedgerIndex,
});

function CustomerLedgerIndex() {
  return (
    <div className="space-y-6 px-4 pb-6 pt-2">
      <h2 className="font-display text-lg font-semibold text-foreground">Your ledger</h2>
      <p className="text-xs text-text-muted">
        View-only entries for your account at each restaurant. Other customers&apos; ledgers are not shown here.
      </p>
      <PersonalLedgerRestaurantPicker mode="customer" showPageTitle={false} />
    </div>
  );
}
