import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { OwnerEntityCard } from "@/components/owner/OwnerEntityCard";
import { PaginatedList } from "@/components/shared/PaginatedList";
import { SuperAdminRowButton, SuperAdminRowLink } from "@/components/superadmin/super-admin-list-selection";
import { SuperAdminEmptyState, SuperAdminPageHeader } from "@/components/superadmin/super-admin-ui";
import { useUsers } from "@/hooks/use-rest-api";
import { apiPatch, resolveMediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { AppModal } from "@/components/shared/AppModal";
import { Plus, TrendingUp } from "lucide-react";

type UserRow = {
  id: number;
  name: string;
  phone: string;
  role: string;
  is_shareholder: boolean;
  share_percentage: number;
  balance: number;
  due_balance: number;
  image?: string | null;
};

/** API `role` for platform super admins (`UserRole.SUPER_ADMIN`). */
const SUPER_ADMIN_ROLE = "super_admin";

function syncShareholderCachesAfterSave(queryClient: QueryClient, token: string | null, updated: UserRow) {
  queryClient.setQueryData<UserRow[]>(["users", undefined, undefined, token], (old) => {
    const prev = Array.isArray(old) ? old : [];
    const i = prev.findIndex((u) => u.id === updated.id);
    if (i >= 0) {
      const next = [...prev];
      next[i] = { ...next[i], ...updated };
      return next;
    }
    return [...prev, updated];
  });
  queryClient.setQueryData<UserRow[]>(["users", undefined, true, token], (old) => {
    if (!updated.is_shareholder) {
      if (!old) return old;
      return old.filter((u) => u.id !== updated.id);
    }
    const prev = Array.isArray(old) ? old : [];
    const i = prev.findIndex((u) => u.id === updated.id);
    if (i >= 0) {
      const next = [...prev];
      next[i] = { ...next[i], ...updated };
      return next;
    }
    return [updated, ...prev];
  });
  return queryClient.refetchQueries({ queryKey: ["users"] });
}

export const Route = createFileRoute("/superadmin/shareholders")({ component: ShareholdersPage });

function ShareholdersPage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { data: allUsers } = useUsers();
  const { data: apiUsers, isLoading } = useUsers(undefined, true);
  const shareholders = useMemo(() => {
    const rows = (apiUsers as UserRow[] | undefined) ?? [];
    return rows.filter((u) => u.is_shareholder);
  }, [apiUsers]);

  const addableShareholderUsers = useMemo(() => {
    const rows = (allUsers as UserRow[] | undefined) ?? [];
    return rows.filter((u) => u.role === SUPER_ADMIN_ROLE && !u.is_shareholder);
  }, [allUsers]);

  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const openAdd = () => {
    setEditUser(null);
    setSubmitError(null);
    setShowForm(true);
  };
  const openEdit = (u: UserRow) => {
    setEditUser(u);
    setSubmitError(null);
    setShowForm(true);
  };

  if (isLoading) {
    return <p className="text-sm text-text-muted">Loading…</p>;
  }

  return (
    <>
      <SuperAdminPageHeader
        title="Shareholders"
        description="Platform equity participants drawn from super administrator accounts: share weights and wallet posture."
        actions={
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-600"
          >
            <Plus size={14} aria-hidden /> Add shareholder
          </button>
        }
      />
      <PaginatedList
        items={shareholders}
        enablePagination
        enableSelection
        empty={<SuperAdminEmptyState>No shareholders yet.</SuperAdminEmptyState>}
        renderItem={(u, sel) => {
            const src = resolveMediaUrl(u.image);
            return (
              <OwnerEntityCard
                {...(sel.selectable ? sel : {})}
                onClick={() => {
                  void navigate({ to: "/superadmin/shareholders/$id", params: { id: String(u.id) } });
                }}
                leading={
                  src ? (
                    <img src={src} alt="" className="h-12 w-12 rounded-xl border border-border object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10 text-violet-700">
                      <TrendingUp strokeWidth={2} aria-hidden />
                    </div>
                  )
                }
                title={u.name}
                subtitle={
                  <span className="text-text-secondary">
                    {u.phone} · {u.share_percentage}% share
                  </span>
                }
                meta={
                  <>
                    <span className="rounded-full bg-surface-alt px-2 py-0.5 text-xs font-medium text-text-secondary">
                      {u.role}
                    </span>
                    <span className="text-xs text-text-secondary">
                      Bal ₹{Number(u.balance).toLocaleString()} · Due ₹{Number(u.due_balance).toLocaleString()}
                    </span>
                  </>
                }
                actions={
                  <>
                    <SuperAdminRowLink sel={sel} to="/superadmin/shareholders/$id" params={{ id: String(u.id) }}>
                      View
                    </SuperAdminRowLink>
                    <SuperAdminRowButton sel={sel} onClick={() => openEdit(u)}>
                      Edit
                    </SuperAdminRowButton>
                  </>
                }
              />
            );
        }}
      />

      {showForm && (
        <AppModal
          key={editUser ? `edit-${editUser.id}` : "add-sh"}
          panelClassName="max-w-md p-6"
        >
            <h3 className="font-display font-semibold text-lg text-foreground mb-4">
              {editUser ? "Edit Shareholder" : "Add Shareholder"}
            </h3>
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!token) return;
                setSubmitError(null);
                const form = e.currentTarget;
                const fd = new FormData(form);
                const uidRaw = editUser ? String(editUser.id) : String(fd.get("user") ?? "").trim();
                const sharePct = Number(fd.get("share_percentage") ?? 0);
                const balance = Number(fd.get("balance") ?? 0);
                const due_balance = Number(fd.get("due_balance") ?? 0);
                const balanceReason = String(fd.get("balance_adjustment_reason") ?? "").trim();
                if (!uidRaw) {
                  setSubmitError("Select a user.");
                  return;
                }
                const userId = Number(uidRaw);
                if (!Number.isFinite(userId)) {
                  setSubmitError("Invalid user.");
                  return;
                }
                if (!editUser) {
                  const picked = (allUsers as UserRow[] | undefined)?.find((u) => u.id === userId);
                  if (!picked || picked.role !== SUPER_ADMIN_ROLE) {
                    setSubmitError("Only super administrator accounts can be added as shareholders.");
                    return;
                  }
                }

                setSubmitBusy(true);
                try {
                  const payload: Record<string, unknown> = {
                    is_shareholder: true,
                    share_percentage: sharePct,
                    balance,
                    due_balance,
                  };
                  if (balanceReason) payload.balance_adjustment_reason = balanceReason;
                  const updated = await apiPatch<UserRow>(`/api/users/${userId}/`, payload, token);
                  await syncShareholderCachesAfterSave(queryClient, token, {
                    ...updated,
                    is_shareholder: true,
                  });
                  setShowForm(false);
                  setEditUser(null);
                } catch (err) {
                  setSubmitError(err instanceof Error ? err.message : "Could not save shareholder.");
                } finally {
                  setSubmitBusy(false);
                }
              }}
            >
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block" htmlFor="sh-user">
                  User *
                </label>
                {editUser ? (
                  <p className="w-full h-11 px-4 rounded-xl border border-border bg-surface-alt text-sm flex items-center text-text-muted">
                    {editUser.name} ({editUser.phone})
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    <select
                      id="sh-user"
                      name="user"
                      required
                      defaultValue=""
                      className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    >
                      <option value="">Select user</option>
                      {addableShareholderUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.phone})
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-text-muted">
                      Only super administrator accounts can be shareholders here. Users already listed as shareholders
                      are not shown.
                    </p>
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block" htmlFor="sh-pct">
                  Share Percentage *
                </label>
                <input
                  id="sh-pct"
                  name="share_percentage"
                  type="number"
                  required
                  min={0}
                  max={100}
                  step="0.01"
                  defaultValue={editUser?.share_percentage != null ? String(editUser.share_percentage) : "0"}
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block" htmlFor="sh-bal">
                  Balance
                </label>
                <input
                  id="sh-bal"
                  name="balance"
                  type="number"
                  step="0.01"
                  defaultValue={editUser?.balance != null ? String(editUser.balance) : "0"}
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
              {editUser ? (
                <div>
                  <label className="text-sm font-medium text-text-secondary mb-1.5 block" htmlFor="sh-bal-reason">
                    Balance change reason (optional)
                  </label>
                  <textarea
                    id="sh-bal-reason"
                    name="balance_adjustment_reason"
                    rows={2}
                    placeholder="Shown on the shareholder's transaction list when balance changes."
                    className="w-full px-4 py-2 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none resize-y min-h-[72px]"
                  />
                </div>
              ) : null}
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block" htmlFor="sh-due">
                  Due Balance
                </label>
                <input
                  id="sh-due"
                  name="due_balance"
                  type="number"
                  step="0.01"
                  defaultValue={editUser?.due_balance != null ? String(editUser.due_balance) : "0"}
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
              {submitError ? <p className="text-sm text-error">{submitError}</p> : null}
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  disabled={submitBusy}
                  onClick={() => {
                    setShowForm(false);
                    setEditUser(null);
                  }}
                  className="flex-1 h-11 rounded-xl border border-border text-sm font-semibold text-text-secondary hover:bg-surface disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitBusy}
                  className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-600 disabled:opacity-60"
                >
                  {submitBusy ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
        </AppModal>
      )}
    </>
  );
}
