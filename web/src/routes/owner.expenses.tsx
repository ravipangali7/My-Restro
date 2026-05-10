import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { OwnerEntityCard, OwnerEntityCardStack, ownerListActionClass, ownerListActionSecondaryClass } from "@/components/owner/OwnerEntityCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useOwnerExpensesByRestaurant, useRestaurants } from "@/hooks/use-rest-api";
import { apiDelete, apiPatch, apiPost } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ownerStaffShowsRestaurantColumn } from "@/lib/restaurant-table-column";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { Calendar, Plus, Receipt } from "lucide-react";

function parseExpenseEditSearch(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export const Route = createFileRoute("/owner/expenses")({
  validateSearch: (search: Record<string, unknown>) => ({
    edit: parseExpenseEditSearch(search.edit),
  }),
  component: ExpensesPage,
});

interface ExpRow {
  id: number;
  expense_id: string;
  category: string;
  expense_date: string;
  particular: string;
  amount: string | number;
  restaurant?: number;
  restaurant_name?: string;
}

function ExpensesPage() {
  const navigate = useNavigate();
  const { edit: editFromSearch } = Route.useSearch();
  const { token, user } = useAuth();
  const qc = useQueryClient();
  const { restaurantId, restaurantIds } = useRestaurantScope();
  const showRestaurantCol = ownerStaffShowsRestaurantColumn(user);
  const { data: restaurantsRaw = [] } = useRestaurants();
  const restaurants = restaurantsRaw as { id: number; name: string }[];
  const restaurantOptionsIds = useMemo(() => {
    const ids = new Set(restaurantIds);
    if (restaurantId != null) ids.add(restaurantId);
    return [...ids].sort((a, b) => a - b);
  }, [restaurantIds, restaurantId]);
  const restaurantOptions = useMemo(
    () => restaurants.filter((r) => restaurantOptionsIds.includes(r.id)),
    [restaurants, restaurantOptionsIds],
  );
  const { sections, mergedExpenses, isPending, error } = useOwnerExpensesByRestaurant();
  const groupByRestaurant = restaurantIds.length > 1;
  const sectionsOrdered = useMemo(() => {
    const nameFor = (id: number) => restaurants.find((r) => r.id === id)?.name ?? `Restaurant #${id}`;
    return [...sections]
      .map((s) => ({ ...s, restaurantName: nameFor(s.restaurantId) }))
      .sort((a, b) => a.restaurantName.localeCompare(b.restaurantName));
  }, [sections, restaurants]);
  const rows = mergedExpenses as ExpRow[];
  const total = useMemo(() => rows.reduce((s, e) => s + Number(e.amount), 0), [rows]);
  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit] = useState<ExpRow | null>(null);
  const [category, setCategory] = useState("other");
  const [particular, setParticular] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formRestaurantId, setFormRestaurantId] = useState<number | null>(null);

  const refresh = () => void qc.invalidateQueries({ queryKey: ["expenses"] });
  const openAdd = () => {
    setEdit(null);
    setFormRestaurantId(restaurantId ?? restaurantIds[0] ?? null);
    setCategory("other");
    setParticular("");
    setAmount("");
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setFormError(null);
    setShowForm(true);
  };
  const openEdit = (row: ExpRow) => {
    setEdit(row);
    setFormRestaurantId(row.restaurant ?? restaurantId ?? restaurantIds[0] ?? null);
    setCategory(row.category || "other");
    setParticular(row.particular);
    setAmount(String(row.amount));
    setExpenseDate((row.expense_date || "").slice(0, 10));
    setFormError(null);
    setShowForm(true);
  };

  useEffect(() => {
    if (editFromSearch == null) return;
    if (isPending && mergedExpenses.length === 0) return;
    const row = (mergedExpenses as ExpRow[]).find((e) => e.id === editFromSearch);
    if (!row) {
      void navigate({ to: "/owner/expenses", search: {}, replace: true });
      return;
    }
    openEdit(row);
    void navigate({ to: "/owner/expenses", search: {}, replace: true });
  }, [editFromSearch, isPending, mergedExpenses, navigate]);

  const handleSave = async () => {
    if (!token) return;
    if (!edit && formRestaurantId == null) return setFormError("Select a restaurant.");
    if (!particular.trim()) return setFormError("Particular is required.");
    if (amount === "" || Number(amount) < 0) return setFormError("Amount must be 0 or greater.");
    setSaving(true);
    try {
      const body = {
        category,
        particular: particular.trim(),
        amount,
        expense_date: expenseDate,
      };
      if (edit) await apiPatch(`/api/expenses/${edit.id}/`, body, token);
      else await apiPost(`/api/expenses/?restaurant_id=${formRestaurantId}`, body, token);
      refresh();
      setShowForm(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save expense.");
    } finally {
      setSaving(false);
    }
  };
  const handleDelete = async (id: number) => {
    if (!token) return;
    if (!window.confirm("Delete this expense?")) return;
    await apiDelete(`/api/expenses/${id}/`, token);
    refresh();
  };

  if (restaurantIds.length === 0) return <p className="text-sm text-text-muted">No restaurants assigned.</p>;
  if (error) return <p className="text-sm text-error">Failed to load expenses.</p>;
  if (isPending) return <p className="text-sm text-text-muted">Loading…</p>;

  const goToExpense = (e: ExpRow) => {
    void navigate({ to: "/owner/expenses/$id", params: { id: String(e.id) } });
  };

  const renderExpenseCards = (list: ExpRow[]) => (
    <OwnerEntityCardStack>
      {list.map((e) => (
        <OwnerEntityCard
          key={e.id}
          onClick={() => goToExpense(e)}
          leading={
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Receipt strokeWidth={2} aria-hidden />
            </div>
          }
          title={e.particular || e.expense_id}
          subtitle={
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <Calendar size={14} className="shrink-0 text-primary" aria-hidden />
                {String(e.expense_date ?? "").slice(0, 10) || "—"}
              </span>
              <span className="text-text-muted">·</span>
              <span className="font-mono text-xs text-text-secondary">{e.expense_id}</span>
            </span>
          }
          meta={
            <>
              {!groupByRestaurant && showRestaurantCol && e.restaurant_name ? (
                <span className="text-xs text-text-muted">{e.restaurant_name}</span>
              ) : null}
              <StatusBadge status={e.category} />
              <span className="font-mono text-base font-semibold text-foreground">₹{Number(e.amount).toLocaleString()}</span>
            </>
          }
          actions={
            <>
              <Link
                to="/owner/expenses/$id"
                params={{ id: String(e.id) }}
                onClick={(ev) => ev.stopPropagation()}
                className={ownerListActionClass}
              >
                View expense
              </Link>
              <button
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  openEdit(e);
                }}
                className={ownerListActionSecondaryClass}
              >
                Edit
              </button>
            </>
          }
        />
      ))}
    </OwnerEntityCardStack>
  );

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display font-semibold text-lg text-foreground">Expenses</h2>
          <p className="text-sm text-text-muted">
            Total:{" "}
            <span className="font-mono font-semibold text-foreground">₹{total.toLocaleString()}</span>
          </p>
        </div>
        <button type="button" onClick={openAdd} className="h-10 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center gap-1">
          <Plus size={14} /> Add Expense
        </button>
      </div>
      {groupByRestaurant ? (
        <div className="space-y-8">
          {sectionsOrdered.map((s) => {
            const sectionRows = (s.expenses as ExpRow[]).slice().sort((a, b) => String(b.expense_date ?? "").localeCompare(String(a.expense_date ?? "")));
            return (
              <section key={s.restaurantId}>
                <h3 className="font-display font-semibold text-base text-foreground mb-3 border-b border-border pb-2">{s.restaurantName}</h3>
                {sectionRows.length === 0 ? (
                  <p className="text-sm text-text-muted">No expenses for this restaurant.</p>
                ) : (
                  renderExpenseCards(sectionRows)
                )}
              </section>
            );
          })}
        </div>
      ) : (
        renderExpenseCards(rows)
      )}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md shadow-xl">
            <h3 className="font-display font-semibold text-lg text-foreground mb-4">{edit ? "Edit Expense" : "Add Expense"}</h3>
            {formError && <p className="text-sm text-error mb-3">{formError}</p>}
            <div className="space-y-3">
              {!edit && (
                <div>
                  <label className="text-sm font-medium text-text-secondary mb-1.5 block">Restaurant *</label>
                  <select
                    value={formRestaurantId ?? ""}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isFinite(v)) return;
                      setFormRestaurantId(v);
                    }}
                    className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                  >
                    <option value="" disabled>
                      Select restaurant
                    </option>
                    {restaurantOptions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm">
                <option value="utilities">Utilities</option>
                <option value="salary">Salary</option>
                <option value="rent">Rent</option>
                <option value="maintenance">Maintenance</option>
                <option value="marketing">Marketing</option>
                <option value="other">Other</option>
              </select>
              <input value={particular} onChange={(e) => setParticular(e.target.value)} placeholder="Particular" className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm" />
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm" />
              <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm" />
            </div>
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 h-11 rounded-xl border border-border text-sm font-semibold text-text-secondary">Cancel</button>
              <button type="button" disabled={saving} onClick={() => void handleSave()} className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
