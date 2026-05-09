import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  useApproveShareholderWithdrawal,
  useRejectShareholderWithdrawal,
  useUsers,
  useWithdrawals,
} from "@/hooks/use-rest-api";
import { Plus } from "lucide-react";

type W = { id: number; user: number; amount: number; status: string; remarks: string; reject_reason?: string };

export const Route = createFileRoute("/superadmin/withdrawals")({ component: WithdrawalsPage });

function WithdrawalsPage() {
  const { data: withdrawals, isLoading } = useWithdrawals();
  const { data: users } = useUsers();
  const approveMut = useApproveShareholderWithdrawal();
  const rejectMut = useRejectShareholderWithdrawal();

  const [filter, setFilter] = useState<string>("all");
  const [rejectModal, setRejectModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editWithdrawal, setEditWithdrawal] = useState<W | null>(null);

  const list = (withdrawals as W[] | undefined) ?? [];
  const filtered = filter === "all" ? list : list.filter((w) => w.status === filter);
  const filters = ["all", "pending", "approved", "rejected"];

  const userName = (uid: number) =>
    (users as { id: number; name: string; phone: string }[] | undefined)?.find((u) => u.id === uid)?.name ?? String(uid);
  const userPhone = (uid: number) =>
    (users as { id: number; phone: string }[] | undefined)?.find((u) => u.id === uid)?.phone ?? "—";

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: list.length };
    for (const w of list) c[w.status] = (c[w.status] || 0) + 1;
    return c;
  }, [list]);

  const openAdd = () => {
    setEditWithdrawal(null);
    setShowForm(true);
  };
  const openEdit = (w: W) => {
    setEditWithdrawal(w);
    setShowForm(true);
  };

  const openReject = (w: W) => {
    setActionError(null);
    setRejectReason("");
    setRejectModal(String(w.id));
  };

  const onApprove = (w: W) => {
    setActionError(null);
    approveMut.mutate(w.id, {
      onError: (e) => setActionError(e instanceof Error ? e.message : "Approve failed."),
    });
  };

  if (isLoading) {
    return <p className="text-sm text-text-muted">Loading…</p>;
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-semibold text-lg text-foreground">Shareholder Withdrawals</h2>
        <button
          onClick={openAdd}
          className="h-10 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary-600 flex items-center gap-1"
        >
          <Plus size={14} /> Add Withdrawal
        </button>
      </div>

      {actionError && <p className="text-sm text-error mb-3">{actionError}</p>}

      <div className="flex gap-2 mb-4">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold capitalize transition-all ${
              filter === f ? "bg-primary text-primary-foreground" : "bg-surface-alt text-text-secondary hover:bg-primary-50"
            }`}
          >
            {f} ({f === "all" ? counts.all : counts[f] ?? 0})
          </button>
        ))}
      </div>

      <DataTable
        columns={[
          { header: "User", accessor: (w) => userName(w.user) },
          { header: "Phone", accessor: (w) => userPhone(w.user) },
          { header: "Amount", accessor: (w) => `₹${Number(w.amount).toLocaleString()}` },
          { header: "Status", accessor: (w) => <StatusBadge status={w.status} /> },
          { header: "Remarks", accessor: "remarks" },
          {
            header: "Actions",
            accessor: (w) => (
              <div className="flex gap-1">
                <Link
                  to="/superadmin/withdrawals/$id"
                  params={{ id: String(w.id) }}
                  className="px-2 py-1 text-xs rounded-lg bg-primary-50 text-primary font-medium hover:bg-primary-100"
                >
                  View
                </Link>
                <button
                  onClick={() => openEdit(w)}
                  className="px-2 py-1 text-xs rounded-lg bg-info/10 text-info font-medium hover:bg-info/20"
                >
                  Edit
                </button>
                {w.status === "pending" && (
                  <>
                    <button
                      type="button"
                      disabled={approveMut.isPending}
                      onClick={() => onApprove(w)}
                      className="px-2 py-1 text-xs rounded-lg bg-success/10 text-success font-medium hover:bg-success/20 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => openReject(w)}
                      className="px-2 py-1 text-xs rounded-lg bg-error/10 text-error font-medium hover:bg-error/20"
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            ),
          },
        ]}
        data={filtered}
      />

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md shadow-xl">
            <h3 className="font-display font-semibold text-lg text-foreground mb-4">
              {editWithdrawal ? "Edit Withdrawal" : "Add Withdrawal"}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block">User *</label>
                <select
                  defaultValue={editWithdrawal?.user != null ? String(editWithdrawal.user) : ""}
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                >
                  <option value="">Select shareholder</option>
                  {(users as { id: number; name: string; is_shareholder: boolean }[] | undefined)
                    ?.filter((x) => x.is_shareholder)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block">Amount *</label>
                <input
                  type="number"
                  defaultValue={editWithdrawal?.amount != null ? String(editWithdrawal.amount) : ""}
                  placeholder="₹ 0"
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block">Status</label>
                <select
                  defaultValue={editWithdrawal?.status || "pending"}
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block">Remarks</label>
                <input
                  type="text"
                  defaultValue={editWithdrawal?.remarks || ""}
                  placeholder="Remarks"
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block">Reject Reason</label>
                <input
                  type="text"
                  defaultValue={editWithdrawal?.reject_reason || ""}
                  placeholder="If rejected"
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 h-11 rounded-xl border border-border text-sm font-semibold text-text-secondary hover:bg-surface"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-600"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-display font-semibold text-lg text-foreground mb-4">Reject Withdrawal</h3>
            {actionError && <p className="text-sm text-error mb-3">{actionError}</p>}
            <div>
              <label className="text-sm font-medium text-text-secondary mb-1.5 block">Reason *</label>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter rejection reason..."
                className="w-full px-4 py-3 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none resize-none"
              />
            </div>
            <div className="flex gap-3 mt-4">
              <button
                type="button"
                onClick={() => {
                  setRejectModal(null);
                  setActionError(null);
                }}
                className="flex-1 h-11 rounded-xl border border-border text-sm font-semibold text-text-secondary hover:bg-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={rejectMut.isPending}
                onClick={() => {
                  const rid = rejectModal;
                  const trimmed = rejectReason.trim();
                  if (!trimmed) {
                    setActionError("A reason is required.");
                    return;
                  }
                  setActionError(null);
                  rejectMut.mutate(
                    { id: Number(rid), reason: trimmed },
                    {
                      onSuccess: () => {
                        setRejectModal(null);
                        setRejectReason("");
                      },
                      onError: (e) => setActionError(e instanceof Error ? e.message : "Reject failed."),
                    },
                  );
                }}
                className="flex-1 h-11 rounded-xl bg-error text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
