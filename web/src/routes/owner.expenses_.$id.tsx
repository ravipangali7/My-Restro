import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ViewField, ViewSection } from "@/components/shared/ViewField";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { useExpense } from "@/hooks/use-rest-api";
import { apiDelete } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { restaurantDisplayName, type RestaurantRowExtras } from "@/lib/restaurant-table-column";
import { money } from "@/lib/money";
import { ArrowLeft, Receipt, Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/owner/expenses_/$id")({ component: ExpenseDetail });

function ExpenseDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const { requestConfirm, ConfirmDialog } = useConfirmAction();
  const { data: e, isLoading, error } = useExpense(id);
  const expenseIdNum = Number(id);

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
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary-50">
            <Receipt size={24} className="text-primary" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-foreground">{e.expense_id}</h2>
            <p className="text-sm text-text-muted">{money(e.amount)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/owner/expenses"
            search={{ edit: expenseIdNum }}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-accent/60"
          >
            <Pencil size={14} aria-hidden /> Edit
          </Link>
          <button
            type="button"
            disabled={deleting || !token}
            onClick={() => {
              if (!token) return;
              requestConfirm({
                title: "Delete expense",
                message: "Delete this expense? This cannot be undone.",
                confirmLabel: "Delete",
                variant: "danger",
                onConfirm: async () => {
                  setDeleting(true);
                  try {
                    await apiDelete(`/api/expenses/${id}/`, token);
                    void queryClient.invalidateQueries({ queryKey: ["expenses"] });
                    void navigate({ to: "/owner/expenses" });
                  } finally {
                    setDeleting(false);
                  }
                },
              });
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-error/10 px-4 text-sm font-semibold text-error hover:bg-error/15 disabled:opacity-50"
          >
            <Trash2 size={14} aria-hidden /> {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
      <ViewSection title="Details">
        <ViewField label="Restaurant" value={restaurantDisplayName(e as RestaurantRowExtras)} />
        <ViewField label="Category" value={e.category ?? "other"} />
        <ViewField label="Expense Date" value={String(e.expense_date ?? "").slice(0, 10) || "—"} />
        <ViewField label="Particular" value={e.particular} />
        <ViewField label="Amount" value={money(e.amount)} />
      </ViewSection>
      {ConfirmDialog}
    </>
  );
}
