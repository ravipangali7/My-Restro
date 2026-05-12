import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { DataTable } from "@/components/shared/DataTable";
import { RouteFormModal } from "@/components/shared/RouteFormModal";
import { ViewField, ViewSection } from "@/components/shared/ViewField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateLedger, useDeleteLedger, useLedgers, useUpdateLedger } from "@/hooks/use-rest-api";
import { money } from "@/lib/money";
import type { LedgerListRow } from "@/components/ledger/ledger-types";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";

function formatLedgerDate(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const orderStyleCardClass =
  "w-full bg-card rounded-xl border border-border p-4 flex items-center justify-between text-left hover:shadow-sm transition-shadow";

export function PartyLedgerDetailView({
  restaurantId,
  partyType,
  partyId,
  partyLabel,
  backHref,
  canMutate,
  /** Customer portal: list each ledger line as a card matching My Orders row styling. */
  useOrderStyleEntryCards = false,
}: {
  restaurantId: number;
  partyType: string;
  partyId: string;
  partyLabel: string;
  backHref: string;
  canMutate: boolean;
  useOrderStyleEntryCards?: boolean;
}) {
  const { data = [], isLoading, error } = useLedgers(restaurantId, partyType, partyId);
  const rows = data as LedgerListRow[];
  const createLedger = useCreateLedger();
  const updateLedger = useUpdateLedger();
  const deleteLedger = useDeleteLedger();

  const [particular, setParticular] = useState("");
  const [amount, setAmount] = useState("");
  const [entryType, setEntryType] = useState<"debit" | "credit">("debit");
  const [editing, setEditing] = useState<LedgerListRow | null>(null);
  const [editParticular, setEditParticular] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editEntryType, setEditEntryType] = useState<"debit" | "credit">("debit");

  const sorted = useMemo(() => [...rows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), [rows]);

  const { totalCredit, totalDebit } = useMemo(() => {
    let c = 0;
    let d = 0;
    for (const r of rows) {
      const n = Number(r.amount);
      if (r.type === "credit") c += n;
      else d += n;
    }
    return { totalCredit: c, totalDebit: d };
  }, [rows]);

  const balance = totalCredit - totalDebit;

  const resetAddForm = () => {
    setParticular("");
    setAmount("");
    setEntryType("debit");
  };

  const onAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canMutate) return;
    const amt = Number.parseFloat(amount);
    if (!particular.trim() || Number.isNaN(amt) || amt < 0) return;
    createLedger.mutate(
      {
        restaurantId,
        body: {
          party_type: partyType,
          party_id: partyId,
          particular: particular.trim(),
          amount: amt,
          type: entryType,
        },
      },
      { onSuccess: () => resetAddForm() },
    );
  };

  const onSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !canMutate) return;
    const amt = Number.parseFloat(editAmount);
    if (!editParticular.trim() || Number.isNaN(amt) || amt < 0) return;
    updateLedger.mutate(
      {
        ledgerId: editing.id,
        restaurantId,
        body: { particular: editParticular.trim(), amount: amt, type: editEntryType },
      },
      {
        onSuccess: () => {
          setEditing(null);
        },
      },
    );
  };

  const openEdit = (r: LedgerListRow) => {
    setEditing(r);
    setEditParticular(r.particular);
    setEditAmount(String(r.amount));
    setEditEntryType(r.type === "credit" ? "credit" : "debit");
  };

  const closeEdit = () => {
    setEditing(null);
  };

  const onDelete = (r: LedgerListRow) => {
    if (!canMutate) return;
    if (!window.confirm("Delete this ledger line?")) return;
    deleteLedger.mutate({ ledgerId: r.id, restaurantId });
  };

  if (error) return <p className="text-sm text-error">Failed to load ledger.</p>;
  if (isLoading) return <p className="text-sm text-text-muted">Loading…</p>;

  return (
    <>
      <Link to={backHref} className="mb-4 flex items-center gap-1 text-sm text-text-secondary hover:text-foreground">
        <ArrowLeft size={16} /> Back
      </Link>

      <div className="mb-6">
        <h2 className="font-display text-xl font-bold text-foreground">{partyLabel}</h2>
        <p className="text-xs capitalize text-text-muted">
          {partyType} · #{partyId}
        </p>
      </div>

      <ViewSection title="Summary">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ViewField label="Total credit" value={<span className="font-mono text-success">{money(totalCredit)}</span>} />
          <ViewField label="Total debit" value={<span className="font-mono text-error">{money(totalDebit)}</span>} />
          <ViewField label="Balance" value={<span className="font-mono font-semibold">{money(balance)}</span>} />
        </div>
      </ViewSection>

      {canMutate && (
        <ViewSection title="Add entry">
          <form onSubmit={onAdd} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <Label htmlFor="ledger-particular">Particular</Label>
              <Input
                id="ledger-particular"
                value={particular}
                onChange={(e) => setParticular(e.target.value)}
                placeholder="Description"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="ledger-amount">Amount</Label>
              <Input
                id="ledger-amount"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="ledger-type">Type</Label>
              <select
                id="ledger-type"
                value={entryType}
                onChange={(e) => setEntryType(e.target.value as "debit" | "credit")}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="debit">Debit</option>
                <option value="credit">Credit</option>
              </select>
            </div>
            <div className="flex items-end sm:col-span-2 lg:col-span-4">
              <Button type="submit" disabled={createLedger.isPending}>
                {createLedger.isPending ? "Saving…" : "Add ledger line"}
              </Button>
            </div>
          </form>
        </ViewSection>
      )}

      <ViewSection title="Ledger">
        {useOrderStyleEntryCards && !canMutate ? (
          <div className="space-y-3">
            {sorted.map((r) => (
              <div key={r.id} className={orderStyleCardClass}>
                <div className="min-w-0 flex-1 pr-3">
                  <p className="text-sm font-semibold text-foreground break-words">{r.particular}</p>
                  <p className="text-xs text-text-secondary mt-0.5">{formatLedgerDate(r.created_at)}</p>
                  <p className="text-xs text-text-muted mt-1 capitalize">{r.type}</p>
                </div>
                <div className="text-right shrink-0">
                  <p
                    className={`text-sm font-bold font-mono ${
                      r.type === "credit" ? "text-success" : "text-error"
                    }`}
                  >
                    {money(r.amount)}
                  </p>
                </div>
              </div>
            ))}
            {sorted.length === 0 && <p className="text-sm text-text-muted px-1 py-2">No ledger entries yet.</p>}
          </div>
        ) : (
          <DataTable
            columns={[
              { header: "Date", accessor: (r) => formatLedgerDate((r as LedgerListRow).created_at) },
              { header: "Particular", accessor: (r) => (r as LedgerListRow).particular },
              {
                header: "Debit",
                accessor: (r) => {
                  const row = r as LedgerListRow;
                  return row.type === "debit" ? <span className="font-mono text-error">{money(row.amount)}</span> : "—";
                },
              },
              {
                header: "Credit",
                accessor: (r) => {
                  const row = r as LedgerListRow;
                  return row.type === "credit" ? <span className="font-mono text-success">{money(row.amount)}</span> : "—";
                },
              },
              ...(canMutate
                ? [
                    {
                      header: "Action",
                      accessor: (r: LedgerListRow) => (
                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-text-secondary hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(r);
                            }}
                          >
                            <Pencil size={14} /> Edit
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-error hover:opacity-90"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(r);
                            }}
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      ),
                    },
                  ]
                : []),
            ]}
            data={sorted}
          />
        )}
      </ViewSection>

      {editing && canMutate && (
        <RouteFormModal title="Edit ledger line" onClose={closeEdit}>
          <form onSubmit={onSaveEdit} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="edit-particular">Particular</Label>
              <Input id="edit-particular" value={editParticular} onChange={(e) => setEditParticular(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="edit-amount">Amount</Label>
              <Input
                id="edit-amount"
                type="number"
                min={0}
                step="0.01"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="edit-type">Type</Label>
              <select
                id="edit-type"
                value={editEntryType}
                onChange={(e) => setEditEntryType(e.target.value as "debit" | "credit")}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="debit">Debit</option>
                <option value="credit">Credit</option>
              </select>
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={updateLedger.isPending}>
                {updateLedger.isPending ? "Saving…" : "Save"}
              </Button>
              <Button type="button" variant="outline" onClick={closeEdit}>
                Cancel
              </Button>
            </div>
          </form>
        </RouteFormModal>
      )}
    </>
  );
}
