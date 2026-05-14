import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { Wallet } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useCreateWithdrawalRequest, useWithdrawals } from "@/hooks/use-rest-api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

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

function formatWhen(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

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
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display font-semibold text-lg text-foreground">Withdrawals</h2>
          <p className="text-[11px] text-text-muted mt-0.5">Request payouts and track review status</p>
        </div>
        <span className="text-xs text-text-muted tabular-nums">{counts.pending} pending</span>
      </div>

      <div className="space-y-4">
        <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <h3 className="font-semibold text-sm text-foreground leading-snug">Request a withdrawal</h3>
          <p className="text-xs text-text-secondary mt-1">
            Submit a request for the super admin to review. Your balance is not reduced until a request is approved.
          </p>
          {user && (
            <div className="mt-4 rounded-lg border border-border bg-surface-alt/50 px-3 py-2.5 text-xs text-text-secondary space-y-1">
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
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="wd-amount" className="text-xs font-medium text-text-secondary mb-1 block">
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
                  className="w-full h-10 px-3 rounded-lg border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
              <div>
                <label htmlFor="wd-remarks" className="text-xs font-medium text-text-secondary mb-1 block">
                  Remarks *
                </label>
                <input
                  id="wd-remarks"
                  type="text"
                  required
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Bank / UPI / reference (required)…"
                  className="w-full h-10 px-3 rounded-lg border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
            </div>
            {formError && <p className="text-sm text-error">{formError}</p>}
            {user && availableForWithdrawal <= 0 && (
              <p className="text-xs text-text-muted">
                You cannot submit a new request until your available amount is above zero (approve or cancel pending
                requests, or wait for your balance to update).
              </p>
            )}
            <button
              type="submit"
              disabled={createReq.isPending || (user != null && availableForWithdrawal <= 0)}
              className="h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-95 disabled:opacity-60"
            >
              {createReq.isPending ? "Submitting…" : "Submit request"}
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-border bg-card p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
            <h3 className="font-semibold text-sm text-foreground">Your requests</h3>
            <div className="flex flex-wrap gap-2">
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
                  className={cn(
                    "px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors",
                    tab === key
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-alt text-text-secondary hover:bg-accent/50",
                  )}
                >
                  {label} ({counts[key]})
                </button>
              ))}
            </div>
          </div>

          {tabRows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-surface-alt/30 p-6 text-center">
              <Wallet className="mx-auto text-text-muted mb-2" size={20} aria-hidden />
              <p className="text-sm text-text-muted">No {tab} requests yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tabRows.map((w) => {
                const isPending = w.status === "pending";
                return (
                  <div
                    key={w.id}
                    className={cn(
                      "rounded-xl border transition-colors",
                      isPending ? "bg-primary-50 border-primary/30" : "bg-card border-border",
                    )}
                  >
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2 min-w-0">
                        <p className="font-semibold text-foreground leading-snug text-sm tabular-nums">
                          ₹{Number(w.amount).toLocaleString()}
                        </p>
                        <StatusBadge status={w.status} />
                      </div>
                      <p className="text-[11px] text-text-muted mt-1">{formatWhen(w.created_at)}</p>
                      <p className="text-xs text-text-secondary mt-1.5 line-clamp-2">
                        {w.remarks?.trim() ? <span className="font-medium text-foreground">Note: </span> : null}
                        {w.remarks?.trim() || "—"}
                      </p>
                      {tab === "rejected" && (w.reject_reason?.trim() || "") !== "" ? (
                        <p className="text-xs text-error mt-2 pt-2 border-t border-border/60">
                          <span className="font-medium">Reason: </span>
                          {w.reject_reason}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
