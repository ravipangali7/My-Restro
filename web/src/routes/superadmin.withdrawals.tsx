import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppModal } from "@/components/shared/AppModal";
import { Plus, Wallet } from "lucide-react";
import {
  OwnerEntityCard,
  OwnerEntityCardStack,
  ownerListActionClass,
  ownerListActionDangerClass,
} from "@/components/owner/OwnerEntityCard";
import { SuperAdminEmptyState, SuperAdminPageHeader } from "@/components/superadmin/super-admin-ui";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import {
  useApproveShareholderWithdrawal,
  useRejectShareholderWithdrawal,
  useUsers,
  useWithdrawals,
} from "@/hooks/use-rest-api";

type W = { id: number; user: number; amount: number; status: string; remarks: string; reject_reason?: string };

type FilterTab = "all" | "pending" | "approved" | "rejected";

export const Route = createFileRoute("/superadmin/withdrawals")({ component: WithdrawalsPage });

function WithdrawalsPage() {
  const navigate = useNavigate();
  const { data: withdrawals, isLoading } = useWithdrawals();
  const { data: users } = useUsers();
  const approveMut = useApproveShareholderWithdrawal();
  const rejectMut = useRejectShareholderWithdrawal();

  const [tab, setTab] = useState<FilterTab>("all");
  const [rejectModal, setRejectModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const { requestConfirm, ConfirmDialog } = useConfirmAction();
  const [showForm, setShowForm] = useState(false);
  const [editWithdrawal, setEditWithdrawal] = useState<W | null>(null);

  const list = (withdrawals as W[] | undefined) ?? [];
  const filtered = tab === "all" ? list : list.filter((w) => w.status === tab);

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
    const name = userName(w.user);
    requestConfirm({
      title: "Approve withdrawal",
      message: `Approve withdrawal of ₹${Number(w.amount).toLocaleString()} for ${name}?`,
      confirmLabel: "Approve",
      variant: "info",
      onConfirm: () => {
        approveMut.mutate(w.id, {
          onError: (e) => setActionError(e instanceof Error ? e.message : "Approve failed."),
        });
      },
    });
  };

  if (isLoading) {
    return <p className="text-sm text-text-muted">Loading…</p>;
  }

  const addButton = (
    <button
      type="button"
      onClick={openAdd}
      className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-600"
    >
      <Plus size={14} aria-hidden /> Add withdrawal
    </button>
  );

  return (
    <>
      <SuperAdminPageHeader
        title="Shareholder withdrawals"
        description="Review payout requests, approve settlements, or reject with a reason."
        actions={addButton}
      />

      {actionError ? <p className="mb-3 text-sm text-error">{actionError}</p> : null}

      <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)} className="mb-4">
        <TabsList className="w-full max-w-2xl flex-wrap justify-stretch sm:w-auto">
          {(["all", "pending", "approved", "rejected"] as const).map((t) => (
            <TabsTrigger key={t} value={t} className="flex-1 capitalize sm:flex-none">
              {t} ({t === "all" ? counts.all : counts[t] ?? 0})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <SuperAdminEmptyState>No withdrawals in this view.</SuperAdminEmptyState>
      ) : (
        <OwnerEntityCardStack>
          {filtered.map((w) => (
            <OwnerEntityCard
              key={w.id}
              onClick={() => {
                void navigate({ to: "/superadmin/withdrawals/$id", params: { id: String(w.id) } });
              }}
              leading={
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Wallet strokeWidth={2} aria-hidden />
                </div>
              }
              title={`₹${Number(w.amount).toLocaleString()}`}
              subtitle={
                <span className="line-clamp-2 text-text-secondary">
                  <span className="font-medium text-foreground">{userName(w.user)}</span>
                  <span className="text-text-muted"> · </span>
                  {userPhone(w.user)}
                  {(w.remarks ?? "").trim() ? (
                    <>
                      <span className="text-text-muted"> · </span>
                      {(w.remarks ?? "").trim()}
                    </>
                  ) : (
                    <span className="text-text-muted"> · No remarks</span>
                  )}
                </span>
              }
              meta={<StatusBadge status={w.status} />}
              actions={
                <>
                  <Link
                    to="/superadmin/withdrawals/$id"
                    params={{ id: String(w.id) }}
                    onClick={(e) => e.stopPropagation()}
                    className={ownerListActionClass}
                  >
                    View
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(w);
                    }}
                    className={ownerListActionClass}
                  >
                    Edit
                  </button>
                  {w.status === "pending" ? (
                    <>
                      <button
                        type="button"
                        disabled={approveMut.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          onApprove(w);
                        }}
                        className={ownerListActionClass}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openReject(w);
                        }}
                        className={ownerListActionDangerClass}
                      >
                        Reject
                      </button>
                    </>
                  ) : null}
                </>
              }
            />
          ))}
        </OwnerEntityCardStack>
      )}

      {showForm && (
        <AppModal panelClassName="max-w-md p-6">
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
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 h-11 rounded-xl border border-border text-sm font-semibold text-text-secondary hover:bg-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-600"
              >
                Save
              </button>
            </div>
        </AppModal>
      )}

      {rejectModal && (
        <AppModal panelClassName="max-w-sm p-6">
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
        </AppModal>
      )}
      {ConfirmDialog}
    </>
  );
}
