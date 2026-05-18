import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { AppModal } from "@/components/shared/AppModal";
import { Plus, Wallet } from "lucide-react";
import { OwnerEntityCard, ownerListActionClass, ownerListActionDangerClass } from "@/components/owner/OwnerEntityCard";
import { ListPageShell, PaginatedList } from "@/components/shared/PaginatedList";
import { SuperAdminEmptyState, SuperAdminPageHeader } from "@/components/superadmin/super-admin-ui";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import {
  useAdminCreateShareholderWithdrawal,
  useAdminUpdateShareholderWithdrawal,
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
  const createMut = useAdminCreateShareholderWithdrawal();
  const updateMut = useAdminUpdateShareholderWithdrawal();

  const [tab, setTab] = useState<FilterTab>("all");
  const [rejectModal, setRejectModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const { requestConfirm, ConfirmDialog } = useConfirmAction();
  const [showForm, setShowForm] = useState(false);
  const [editWithdrawal, setEditWithdrawal] = useState<W | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);

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
    setFormError(null);
    setShowForm(true);
  };
  const openEdit = (w: W) => {
    setEditWithdrawal(w);
    setFormError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditWithdrawal(null);
    setFormError(null);
  };

  const onFormSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    const form = e.currentTarget;
    const fd = new FormData(form);
    const userId = Number(fd.get("user"));
    const amountRaw = String(fd.get("amount") ?? "").trim();
    const nextStatus = String(fd.get("status") || "pending");
    const remarks = String(fd.get("remarks") ?? "").trim();
    const rejectReason = String(fd.get("reject_reason") ?? "").trim();

    if (!userId) {
      setFormError("Select a shareholder.");
      return;
    }
    if (!remarks) {
      setFormError("Remarks are required.");
      return;
    }
    const amountNum = Number(amountRaw);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setFormError("Enter a valid amount greater than zero.");
      return;
    }
    if (nextStatus === "rejected" && !rejectReason) {
      setFormError("Reject reason is required when status is rejected.");
      return;
    }

    const amount = amountNum.toFixed(2);
    setFormSubmitting(true);

    try {
      if (!editWithdrawal) {
        const created = (await createMut.mutateAsync({
          user: userId,
          amount,
          remarks,
        })) as { id: number };
        if (nextStatus === "approved") {
          await approveMut.mutateAsync(created.id);
        } else if (nextStatus === "rejected") {
          await rejectMut.mutateAsync({ id: created.id, reason: rejectReason });
        }
        closeForm();
        return;
      }

      if (editWithdrawal.status !== "pending") {
        setFormError("Only pending withdrawals can be edited.");
        return;
      }

      const patchBody: { user?: number; amount?: string; remarks?: string } = {};
      if (userId !== editWithdrawal.user) patchBody.user = userId;
      if (amount !== Number(editWithdrawal.amount).toFixed(2)) patchBody.amount = amount;
      if (remarks !== (editWithdrawal.remarks ?? "").trim()) patchBody.remarks = remarks;

      if (Object.keys(patchBody).length > 0) {
        await updateMut.mutateAsync({ id: editWithdrawal.id, body: patchBody });
      }

      if (nextStatus !== editWithdrawal.status) {
        if (nextStatus === "approved") {
          await approveMut.mutateAsync(editWithdrawal.id);
        } else if (nextStatus === "rejected") {
          await rejectMut.mutateAsync({ id: editWithdrawal.id, reason: rejectReason });
        }
      }

      closeForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setFormSubmitting(false);
    }
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
      <ListPageShell
        header={
          <>
            <SuperAdminPageHeader
              title="Shareholder withdrawals"
              description="Review payout requests, approve settlements, or reject with a reason."
              actions={addButton}
            />
            {actionError ? <p className="text-sm text-error">{actionError}</p> : null}
            <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
              <TabsList className="w-full max-w-2xl flex-wrap justify-stretch sm:w-auto">
                {(["all", "pending", "approved", "rejected"] as const).map((t) => (
                  <TabsTrigger key={t} value={t} className="flex-1 capitalize sm:flex-none">
                    {t} ({t === "all" ? counts.all : counts[t] ?? 0})
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </>
        }
      >
      <PaginatedList
        items={filtered}
        resetDeps={[tab]}
        empty={<SuperAdminEmptyState>No withdrawals in this view.</SuperAdminEmptyState>}
        renderItem={(w, sel) => (
            <OwnerEntityCard
              {...(sel.selectable ? sel : {})}
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
        )}
      />
      </ListPageShell>

      {showForm && (
        <AppModal
          key={editWithdrawal ? `edit-${editWithdrawal.id}` : "add-withdrawal"}
          panelClassName="max-w-md p-6"
        >
            <h3 className="font-display font-semibold text-lg text-foreground mb-4">
              {editWithdrawal ? "Edit Withdrawal" : "Add Withdrawal"}
            </h3>
            {formError ? <p className="mb-3 text-sm text-error">{formError}</p> : null}
            {editWithdrawal && editWithdrawal.status !== "pending" ? (
              <p className="mb-3 text-sm text-text-muted">
                This withdrawal is {editWithdrawal.status}. Only pending requests can be changed.
              </p>
            ) : null}
            <form className="space-y-4" onSubmit={onFormSubmit}>
              <div>
                <label htmlFor="wd-user" className="text-sm font-medium text-text-secondary mb-1.5 block">
                  User *
                </label>
                <select
                  id="wd-user"
                  name="user"
                  required
                  disabled={Boolean(editWithdrawal && editWithdrawal.status !== "pending")}
                  defaultValue={editWithdrawal?.user != null ? String(editWithdrawal.user) : ""}
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-60"
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
                <label htmlFor="wd-amount" className="text-sm font-medium text-text-secondary mb-1.5 block">
                  Amount *
                </label>
                <input
                  id="wd-amount"
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  disabled={Boolean(editWithdrawal && editWithdrawal.status !== "pending")}
                  defaultValue={editWithdrawal?.amount != null ? String(editWithdrawal.amount) : ""}
                  placeholder="₹ 0"
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="wd-status" className="text-sm font-medium text-text-secondary mb-1.5 block">
                  Status
                </label>
                <select
                  id="wd-status"
                  name="status"
                  defaultValue={editWithdrawal?.status || "pending"}
                  disabled={Boolean(editWithdrawal && editWithdrawal.status !== "pending")}
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-60"
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div>
                <label htmlFor="wd-remarks" className="text-sm font-medium text-text-secondary mb-1.5 block">
                  Remarks *
                </label>
                <input
                  id="wd-remarks"
                  name="remarks"
                  type="text"
                  required
                  disabled={Boolean(editWithdrawal && editWithdrawal.status !== "pending")}
                  defaultValue={editWithdrawal?.remarks || ""}
                  placeholder="Payout method or reference"
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="wd-reject-reason" className="text-sm font-medium text-text-secondary mb-1.5 block">
                  Reject reason
                </label>
                <input
                  id="wd-reject-reason"
                  name="reject_reason"
                  type="text"
                  disabled={Boolean(editWithdrawal && editWithdrawal.status !== "pending")}
                  defaultValue={editWithdrawal?.reject_reason || ""}
                  placeholder="Required if status is rejected"
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-60"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={formSubmitting}
                  className="flex-1 h-11 rounded-xl border border-border text-sm font-semibold text-text-secondary hover:bg-surface disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    formSubmitting ||
                    Boolean(editWithdrawal && editWithdrawal.status !== "pending")
                  }
                  className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-600 disabled:opacity-50"
                >
                  {formSubmitting ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
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
