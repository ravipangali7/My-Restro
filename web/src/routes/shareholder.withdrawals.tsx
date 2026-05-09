import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useCreateWithdrawalRequest, useWithdrawals } from "@/hooks/use-rest-api";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/shareholder/withdrawals")({
  component: ShareholderWithdrawals,
});

interface WRow {
  id: number;
  user: number;
  amount: string | number;
  status: string;
  remarks: string;
  reject_reason?: string;
  created_at?: string;
}

type WithdrawalTab = "pending" | "approved" | "rejected";

function ShareholderWithdrawals() {
  const { user } = useAuth();
  const { data = [], isLoading, error } = useWithdrawals();
  const createReq = useCreateWithdrawalRequest();

  const [tab, setTab] = useState<WithdrawalTab>("pending");
  const [amount, setAmount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const rows = useMemo(
    () => (data as WRow[]).filter((w) => (user ? w.user === user.id : true)),
    [data, user],
  );

  const balanceNum = user ? Number(user.balance) : 0;
  const pendingReserved = useMemo(
    () => rows.filter((w) => w.status === "pending").reduce((s, w) => s + Number(w.amount), 0),
    [rows],
  );
  const availableForWithdrawal = Math.max(0, balanceNum - pendingReserved);

  const tabRows = useMemo(() => rows.filter((w) => w.status === tab), [rows, tab]);

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0 };
    for (const w of rows) {
      if (w.status === "pending") c.pending += 1;
      else if (w.status === "approved") c.approved += 1;
      else if (w.status === "rejected") c.rejected += 1;
    }
    return c;
  }, [rows]);

  const columns = useMemo(() => {
    const base: {
      header: string;
      accessor: keyof WRow | ((row: WRow) => ReactNode);
    }[] = [
      { header: "Requested", accessor: (w) => (w.created_at ? new Date(w.created_at).toLocaleString() : "—") },
      { header: "Amount", accessor: (w) => `₹${Number(w.amount).toLocaleString()}` },
      { header: "Status", accessor: (w) => <StatusBadge status={w.status} /> },
      { header: "Note", accessor: (w) => w.remarks || "—" },
    ];
    if (tab === "rejected") {
      base.push({ header: "Reason", accessor: (w) => w.reject_reason || "—" });
    }
    return base;
  }, [tab]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const remarksTrimmed = remarks.trim();
    if (!remarksTrimmed) {
      setFormError("Remarks are required (e.g. payout method or reference).");
      return;
    }
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setFormError("Enter a valid amount greater than zero.");
      return;
    }
    if (n > availableForWithdrawal + 1e-9) {
      setFormError(
        `Amount cannot exceed your available balance (₹${availableForWithdrawal.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} after pending requests).`,
      );
      return;
    }
    createReq.mutate(
      { amount: n.toFixed(2), remarks: remarksTrimmed },
      {
        onSuccess: () => {
          setAmount("");
          setRemarks("");
          setTab("pending");
        },
        onError: (err) => {
          setFormError(err instanceof Error ? err.message : "Request failed.");
        },
      },
    );
  };

  if (error) return <p className="text-sm text-error">Could not load withdrawals.</p>;
  if (isLoading) return <p className="text-sm text-text-muted">Loading…</p>;

  return (
    <div className="space-y-6">
      <h2 className="font-display font-semibold text-lg text-foreground">Withdrawals</h2>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="font-display font-semibold text-base text-foreground mb-1">Request a withdrawal</h3>
        <p className="text-sm text-text-muted mb-4">
          Submit a request for the super admin to review. Your balance is not reduced until a request is approved.
        </p>
        {user && (
          <div className="rounded-xl border border-border bg-surface-alt/60 px-4 py-3 text-sm text-text-secondary mb-4 space-y-1">
            <p>
              <span className="font-medium text-foreground">Current balance:</span> ₹
              {balanceNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p>
              <span className="font-medium text-foreground">Held in pending requests:</span> ₹
              {pendingReserved.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p>
              <span className="font-medium text-foreground">Available to request now:</span> ₹
              {availableForWithdrawal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        )}
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="wd-amount" className="text-sm font-medium text-text-secondary mb-1.5 block">
                Amount (₹) *
              </label>
              <input
                id="wd-amount"
                type="number"
                min="0"
                max={availableForWithdrawal > 0 ? availableForWithdrawal : undefined}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
            <div>
              <label htmlFor="wd-remarks" className="text-sm font-medium text-text-secondary mb-1.5 block">
                Remarks *
              </label>
              <input
                id="wd-remarks"
                type="text"
                required
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Bank / UPI / reference (required)…"
                className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
          </div>
          {formError && <p className="text-sm text-error">{formError}</p>}
          {user && availableForWithdrawal <= 0 && (
            <p className="text-sm text-text-muted">
              You cannot submit a new request until your available amount is above zero (approve or cancel pending
              requests, or wait for your balance to update).
            </p>
          )}
          <button
            type="submit"
            disabled={createReq.isPending || (user != null && availableForWithdrawal <= 0)}
            className="h-11 px-6 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-600 disabled:opacity-60"
          >
            {createReq.isPending ? "Submitting…" : "Submit request"}
          </button>
        </form>
      </section>

      <section>
        <h3 className="font-display font-semibold text-base text-foreground mb-3">Your requests</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {(
            [
              ["pending", "Pending"],
              ["approved", "Approved"],
              ["rejected", "Rejected"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                tab === key ? "bg-primary text-primary-foreground" : "bg-surface-alt text-text-secondary hover:bg-primary-50"
              }`}
            >
              {label} ({counts[key]})
            </button>
          ))}
        </div>
        {tabRows.length === 0 ? (
          <p className="text-sm text-text-muted py-6 text-center rounded-xl border border-dashed border-border">
            No {tab} requests yet.
          </p>
        ) : (
          <DataTable columns={columns} data={tabRows} />
        )}
      </section>
    </div>
  );
}
