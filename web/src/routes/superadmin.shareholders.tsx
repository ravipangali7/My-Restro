import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { useUsers } from "@/hooks/use-rest-api";
import { apiPatch, resolveMediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Plus } from "lucide-react";

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
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-semibold text-lg text-foreground">Shareholders</h2>
        <button
          onClick={openAdd}
          className="h-10 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary-600 flex items-center gap-1"
        >
          <Plus size={14} /> Add Shareholder
        </button>
      </div>
      <DataTable
        columns={[
          {
            header: "Photo",
            accessor: (u) => {
              const src = resolveMediaUrl(u.image);
              return src ? (
                <img src={src} alt="" className="w-9 h-9 rounded-lg object-cover border border-border" />
              ) : (
                <span className="text-xs text-text-muted">—</span>
              );
            },
          },
          { header: "Name", accessor: "name" },
          { header: "Phone", accessor: "phone" },
          { header: "Role", accessor: "role" },
          { header: "Share %", accessor: (u) => `${u.share_percentage}%` },
          { header: "Balance", accessor: (u) => `₹${Number(u.balance).toLocaleString()}` },
          { header: "Due Balance", accessor: (u) => `₹${Number(u.due_balance).toLocaleString()}` },
          {
            header: "Actions",
            accessor: (u) => (
              <div className="flex gap-1">
                <Link
                  to="/superadmin/shareholders/$id"
                  params={{ id: String(u.id) }}
                  className="px-2 py-1 text-xs rounded-lg bg-primary-50 text-primary font-medium hover:bg-primary-100"
                >
                  View
                </Link>
                <button
                  onClick={() => openEdit(u)}
                  className="px-2 py-1 text-xs rounded-lg bg-info/10 text-info font-medium hover:bg-info/20"
                >
                  Edit
                </button>
              </div>
            ),
          },
        ]}
        data={shareholders}
      />

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div
            className="bg-card rounded-2xl border border-border p-6 w-full max-w-md shadow-xl"
            key={editUser ? `edit-${editUser.id}` : "add-sh"}
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
          </div>
        </div>
      )}
    </>
  );
}
