import { createFileRoute } from "@tanstack/react-router";
import { ListPageShell } from "@/components/shared/PaginatedList";
import { PaginatedDataTable } from "@/components/shared/PaginatedDataTable";
import { useExpenses } from "@/hooks/use-rest-api";
import { useAuth } from "@/lib/auth-context";
import { ownerStaffShowsRestaurantColumn, restaurantTableColumn, type RestaurantRowExtras } from "@/lib/restaurant-table-column";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { money } from "@/lib/money";

export const Route = createFileRoute("/staff/expenses")({ component: StaffExpenses });

type ExpenseRow = RestaurantRowExtras & { id: number; expense_id: string; particular: string; amount: string | number };

function StaffExpenses() {
  const { user } = useAuth();
  const { restaurantId } = useRestaurantScope();
  const showRestaurantCol = ownerStaffShowsRestaurantColumn(user);
  const { data: rows = [], isLoading } = useExpenses(restaurantId);

  if (restaurantId == null) {
    return <p className="text-sm text-text-muted">No restaurant context.</p>;
  }
  if (isLoading) {
    return <p className="text-sm text-text-muted">Loading…</p>;
  }

  return (
    <>
      <ListPageShell header={<h2 className="font-display font-semibold text-lg text-foreground mb-4">Expenses</h2>}>
        <PaginatedDataTable
        enablePagination
        columns={[
          { header: "Expense ID", accessor: "expense_id" },
          ...(showRestaurantCol ? [restaurantTableColumn<ExpenseRow>()] : []),
          { header: "Particular", accessor: "particular" },
          { header: "Amount", accessor: r => money(r.amount) },
        ]}
        data={rows as ExpenseRow[]}
      />
      </ListPageShell>
    </>
  );
}
