import { createFileRoute, Link } from "@tanstack/react-router";
import { ViewField, ViewSection } from "@/components/shared/ViewField";
import { useExpense } from "@/hooks/use-rest-api";
import { restaurantDisplayName, type RestaurantRowExtras } from "@/lib/restaurant-table-column";
import { money } from "@/lib/money";
import { ArrowLeft, Receipt } from "lucide-react";

export const Route = createFileRoute("/owner/expenses_/$id")({ component: ExpenseDetail });

function ExpenseDetail() {
  const { id } = Route.useParams();
  const { data: e, isLoading, error } = useExpense(id);

  if (isLoading) {
    return <p className="text-sm text-text-muted">Loading…</p>;
  }
  if (error) {
    return <p className="text-sm text-error">Failed to load expense.</p>;
  }
  if (!e) {
    return <p className="text-sm text-text-muted">Expense not found, or you do not have access.</p>;
  }

  return (
    <>
      <Link
        to="/owner/expenses"
        className="flex items-center gap-1 text-sm text-text-secondary hover:text-foreground mb-4"
      >
        <ArrowLeft size={16} /> Back
      </Link>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center">
          <Receipt size={24} className="text-primary" />
        </div>
        <div>
          <h2 className="font-display font-bold text-xl text-foreground">{e.expense_id}</h2>
          <p className="text-sm text-text-muted">{money(e.amount)}</p>
        </div>
      </div>
      <ViewSection title="Details">
        <ViewField label="Restaurant" value={restaurantDisplayName(e as RestaurantRowExtras)} />
        <ViewField label="Category" value={e.category ?? "other"} />
        <ViewField label="Expense Date" value={String(e.expense_date ?? "").slice(0, 10) || "—"} />
        <ViewField label="Particular" value={e.particular} />
        <ViewField label="Amount" value={money(e.amount)} />
      </ViewSection>
    </>
  );
}
