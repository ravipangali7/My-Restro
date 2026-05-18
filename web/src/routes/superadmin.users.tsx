import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { OwnerEntityCard } from "@/components/owner/OwnerEntityCard";
import { PaginatedList } from "@/components/shared/PaginatedList";
import {
  SuperAdminBulkToolbarButton,
  SuperAdminRowButton,
  SuperAdminRowLink,
} from "@/components/superadmin/super-admin-list-selection";
import { SuperAdminEmptyState, SuperAdminPageHeader } from "@/components/superadmin/super-admin-ui";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { useRestaurants, useUsers } from "@/hooks/use-rest-api";
import { apiDelete, apiPatch, apiPatchForm, apiPost, apiPostForm, resolveMediaUrl } from "@/lib/api";
import { parseLocalPhone } from "@/lib/phone-validation";
import { useAuth } from "@/lib/auth-context";
import { AppModal } from "@/components/shared/AppModal";
import { Plus, UsersRound } from "lucide-react";

type StaffPlacement = {
  restaurant_id: number;
  restaurant_name: string;
  staff_role: string;
};

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
  staff_placements?: StaffPlacement[];
};

/** Merge a newly created user into every `["users", …]` query cache, then refetch so the list matches the server. */
function syncUsersListAfterCreate(queryClient: QueryClient, created: UserRow) {
  queryClient.setQueriesData<UserRow[]>({ queryKey: ["users"] }, (old) => {
    const prev = Array.isArray(old) ? old : [];
    if (prev.some((u) => u.id === created.id)) return prev;
    return [created, ...prev];
  });
  return queryClient.refetchQueries({ queryKey: ["users"] });
}

export const Route = createFileRoute("/superadmin/users")({ component: UsersPage });

function UsersPage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { data: restaurants } = useRestaurants();
  const { data: apiUsers, isLoading } = useUsers();
  const users = (apiUsers as UserRow[] | undefined) ?? [];

  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [addRole, setAddRole] = useState<"owner" | "staff" | "customer">("customer");
  const [addIsShareholder, setAddIsShareholder] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editIsShareholder, setEditIsShareholder] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const { requestConfirm, ConfirmDialog } = useConfirmAction();

  const restaurantRows = (restaurants as { id: number; name: string }[] | undefined) ?? [];

  const openAdd = () => {
    setEditUser(null);
    setAddRole("customer");
    setAddIsShareholder(false);
    setAddError(null);
    setEditError(null);
    setShowForm(true);
  };
  const openEdit = (u: UserRow) => {
    setEditUser(u);
    setEditError(null);
    setShowForm(true);
  };

  useEffect(() => {
    if (editUser) setEditIsShareholder(editUser.is_shareholder);
  }, [editUser]);

  if (isLoading) {
    return <p className="text-sm text-text-muted">Loading users…</p>;
  }

  return (
    <>
      <SuperAdminPageHeader
        title="Users"
        description="Owners, staff, customers, shareholder flags, and wallet balances across the directory."
        actions={
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-600"
          >
            <Plus size={14} aria-hidden /> Add user
          </button>
        }
      />

      <PaginatedList
        items={users}
        enablePagination
        enableSelection
        selectionActions={({ selectedIds, clearSelection }) =>
          selectedIds.length > 0 ? (
            <SuperAdminBulkToolbarButton
              variant="danger"
              onClick={() => {
                if (!token) return;
                requestConfirm({
                  title: "Delete selected users",
                  message: `Delete ${selectedIds.length} user(s)? This cannot be undone.`,
                  confirmLabel: "Delete",
                  variant: "danger",
                  onConfirm: async () => {
                    for (const id of selectedIds) {
                      await apiDelete(`/api/users/${id}/`, token);
                    }
                    await queryClient.invalidateQueries({ queryKey: ["users"] });
                    clearSelection();
                  },
                });
              }}
            >
              Delete selected ({selectedIds.length})
            </SuperAdminBulkToolbarButton>
          ) : null
        }
        empty={<SuperAdminEmptyState>No users yet.</SuperAdminEmptyState>}
        renderItem={(u, sel) => {
            const src = resolveMediaUrl(u.image);
            const placements = u.staff_placements ?? [];
            return (
              <OwnerEntityCard
                {...(sel.selectable ? sel : {})}
                onClick={() => {
                  void navigate({ to: "/superadmin/users/$id", params: { id: String(u.id) } });
                }}
                leading={
                  src ? (
                    <img src={src} alt="" className="h-12 w-12 rounded-xl border border-border object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <UsersRound strokeWidth={2} aria-hidden />
                    </div>
                  )
                }
                title={u.name}
                subtitle={
                  <span className="text-text-secondary">
                    {u.phone}
                    {u.role === "staff" && placements.length > 0 ? (
                      <span className="text-text-muted">
                        {" "}
                        ·{" "}
                        {placements.map((p) => p.restaurant_name).join(", ")}
                      </span>
                    ) : null}
                  </span>
                }
                meta={
                  <>
                    <StatusBadge status={u.role} />
                    {u.role === "staff" && placements.length > 0
                      ? placements.map((p) => (
                          <StatusBadge key={`${p.restaurant_id}-${p.staff_role}`} status={p.staff_role} />
                        ))
                      : null}
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        u.is_shareholder ? "bg-success/10 text-success" : "bg-surface-alt text-text-muted"
                      }`}
                    >
                      {u.is_shareholder ? "Shareholder" : "Not shareholder"}
                    </span>
                    <span className="text-xs text-text-secondary">
                      Bal ₹{Number(u.balance).toLocaleString()} · Due ₹{Number(u.due_balance).toLocaleString()}
                    </span>
                  </>
                }
                actions={
                  <>
                    <SuperAdminRowLink sel={sel} to="/superadmin/users/$id" params={{ id: String(u.id) }}>
                      View
                    </SuperAdminRowLink>
                    <SuperAdminRowButton sel={sel} onClick={() => openEdit(u)}>
                      Edit
                    </SuperAdminRowButton>
                    <SuperAdminRowButton
                      sel={sel}
                      variant="danger"
                      disabled={deletingId === u.id}
                      onClick={() => {
                        if (!token) return;
                        requestConfirm({
                          title: "Delete user",
                          message: `Delete user “${u.name}”? This cannot be undone.`,
                          confirmLabel: "Delete",
                          variant: "danger",
                          onConfirm: async () => {
                            setDeletingId(u.id);
                            try {
                              await apiDelete(`/api/users/${u.id}/`, token);
                              await queryClient.invalidateQueries({ queryKey: ["users"] });
                            } finally {
                              setDeletingId(null);
                            }
                          },
                        });
                      }}
                    >
                      {deletingId === u.id ? "Deleting…" : "Delete"}
                    </SuperAdminRowButton>
                  </>
                }
              />
            );
        }}
      />

      {showForm && (
        <AppModal
          key={editUser ? `edit-${editUser.id}` : "add-user"}
          panelClassName="max-w-md p-6"
        >
            {editUser ? (
              <>
                <h3 className="font-display font-semibold text-lg text-foreground mb-4">Edit User</h3>
                <form
                  className="space-y-4"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!editUser || !token) return;
                    setEditError(null);
                    setEditSubmitting(true);
                    const form = e.currentTarget;
                    const fd = new FormData(form);
                    const name = String(fd.get("name") || "").trim();
                    const roleField = fd.get("role");
                    const role =
                      editUser.role === "super_admin"
                        ? editUser.role
                        : editIsShareholder
                          ? editUser.role
                          : String(roleField || "").trim();
                    const share_percentage = Number(fd.get("share_percentage") ?? 0);
                    const balance = Number(fd.get("balance") ?? 0);
                    const due_balance = Number(fd.get("due_balance") ?? 0);
                    const imageEl = form.elements.namedItem("image") as HTMLInputElement | null;
                    const imageFile = imageEl?.files?.[0];
                    try {
                      if (imageFile) {
                        const formData = new FormData();
                        formData.append("name", name);
                        if (editUser.role !== "super_admin" && !editIsShareholder) {
                          formData.append("role", role);
                        }
                        formData.append("is_shareholder", editIsShareholder ? "true" : "false");
                        formData.append("share_percentage", String(share_percentage));
                        formData.append("balance", String(balance));
                        formData.append("due_balance", String(due_balance));
                        formData.append("image", imageFile);
                        await apiPatchForm<UserRow>(`/api/users/${editUser.id}/`, formData, token);
                      } else {
                        const body: Record<string, unknown> = {
                          name,
                          is_shareholder: editIsShareholder,
                          share_percentage,
                          balance,
                          due_balance,
                        };
                        if (editUser.role !== "super_admin" && !editIsShareholder) {
                          body.role = role;
                        }
                        await apiPatch<UserRow>(`/api/users/${editUser.id}/`, body, token);
                      }
                      await queryClient.invalidateQueries({ queryKey: ["users"] });
                      setShowForm(false);
                      setEditUser(null);
                    } catch (err) {
                      setEditError(err instanceof Error ? err.message : "Could not update user.");
                    } finally {
                      setEditSubmitting(false);
                    }
                  }}
                >
                  <div>
                    <label className="text-sm font-medium text-text-secondary mb-1.5 block" htmlFor="edit-name">
                      Name *
                    </label>
                    <input
                      id="edit-name"
                      name="name"
                      type="text"
                      required
                      defaultValue={editUser.name}
                      placeholder="Full name"
                      className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-text-secondary mb-1.5 block">Phone *</label>
                    <input
                      type="text"
                      defaultValue={editUser.phone}
                      readOnly
                      className="w-full h-11 px-4 rounded-xl border border-border bg-surface-alt text-sm text-text-muted outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="edit_is_sh"
                      type="checkbox"
                      checked={editIsShareholder}
                      onChange={(ev) => setEditIsShareholder(ev.target.checked)}
                      className="rounded border-border"
                    />
                    <label htmlFor="edit_is_sh" className="text-sm font-medium text-text-secondary">
                      Is shareholder
                    </label>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-text-secondary mb-1.5 block" htmlFor="edit-role">
                      Role {editIsShareholder ? "" : "*"}
                    </label>
                    {editUser.role === "super_admin" ? (
                      <p className="w-full h-11 px-4 rounded-xl border border-border bg-surface-alt text-sm flex items-center text-text-muted">
                        Super Admin
                      </p>
                    ) : editIsShareholder ? (
                      <p className="w-full min-h-11 px-4 py-2 rounded-xl border border-border bg-surface-alt text-sm text-text-muted">
                        No role is assigned while this user is a shareholder. Uncheck “Is shareholder” to set Owner,
                        Staff, or Customer.
                      </p>
                    ) : (
                      <select
                        id="edit-role"
                        name="role"
                        defaultValue={editUser.role}
                        className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                      >
                        <option value="owner">Owner</option>
                        <option value="staff">Staff</option>
                        <option value="customer">Customer</option>
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-text-secondary mb-1.5 block" htmlFor="edit-image">
                      Image
                    </label>
                    {resolveMediaUrl(editUser.image) ? (
                      <div className="mb-2">
                        <p className="text-xs text-text-muted mb-1">Current</p>
                        <img
                          src={resolveMediaUrl(editUser.image) ?? ""}
                          alt=""
                          className="w-16 h-16 rounded-lg object-cover border border-border"
                        />
                      </div>
                    ) : null}
                    <input
                      id="edit-image"
                      name="image"
                      type="file"
                      accept="image/*"
                      className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm file:mr-3 file:border-0 file:bg-primary-50 file:text-primary file:text-xs file:font-semibold file:rounded-lg file:px-3 file:py-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-text-secondary mb-1.5 block" htmlFor="edit-sh-pct">
                      Share Percentage
                    </label>
                    <input
                      id="edit-sh-pct"
                      name="share_percentage"
                      type="number"
                      step="0.01"
                      defaultValue={String(editUser.share_percentage)}
                      className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-text-secondary mb-1.5 block" htmlFor="edit-balance">
                      Balance
                    </label>
                    <input
                      id="edit-balance"
                      name="balance"
                      type="number"
                      step="0.01"
                      defaultValue={String(editUser.balance)}
                      className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-text-secondary mb-1.5 block" htmlFor="edit-due">
                      Due Balance
                    </label>
                    <input
                      id="edit-due"
                      name="due_balance"
                      type="number"
                      step="0.01"
                      defaultValue={String(editUser.due_balance)}
                      className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  {editError ? <p className="text-sm text-error">{editError}</p> : null}
                  <div className="flex gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => {
                        setShowForm(false);
                        setEditUser(null);
                      }}
                      disabled={editSubmitting}
                      className="flex-1 h-11 rounded-xl border border-border text-sm font-semibold text-text-secondary hover:bg-surface disabled:opacity-60"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={editSubmitting}
                      className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-600 disabled:opacity-60"
                    >
                      {editSubmitting ? "Saving…" : "Save"}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <h3 className="font-display font-semibold text-lg text-foreground mb-4">Add User</h3>
                <form
                  className="space-y-4"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setAddError(null);
                    const form = e.currentTarget;
                    const fd = new FormData(form);
                    const name = String(fd.get("name") || "").trim();
                    const phoneParsed = parseLocalPhone(String(fd.get("phone") || ""));
                    if (!name) {
                      setAddError("Name is required.");
                      return;
                    }
                    if (!phoneParsed.ok) {
                      setAddError(phoneParsed.message);
                      return;
                    }
                    const phone = phoneParsed.digits;
                    const isShare = addIsShareholder;
                    const role = isShare ? ("customer" as const) : addRole;
                    const share_percentage = Number(fd.get("share_percentage") || 0);
                    const balance = Number(fd.get("balance") ?? 0);
                    const due_balance = Number(fd.get("due_balance") ?? 0);
                    const imageEl = form.elements.namedItem("image") as HTMLInputElement | null;
                    const imageFile = imageEl?.files?.[0];

                    if (!isShare && role === "staff") {
                      const rid = fd.get("restaurant_id");
                      if (!rid) {
                        setAddError("Select a restaurant for staff.");
                        return;
                      }
                    }

                    setAddSubmitting(true);
                    try {
                      if (imageFile) {
                        const formData = new FormData();
                        formData.append("name", name);
                        formData.append("phone", phone);
                        formData.append("role", role);
                        formData.append("is_shareholder", isShare ? "true" : "false");
                        formData.append("share_percentage", String(share_percentage));
                        formData.append("balance", String(balance));
                        formData.append("due_balance", String(due_balance));
                        formData.append("image", imageFile);
                        if (!isShare && role === "staff") {
                          formData.append("restaurant_id", String(fd.get("restaurant_id")));
                          formData.append("staff_role", String(fd.get("staff_role") || "waiter"));
                        }
                        const created = await apiPostForm<UserRow>("/api/users/", formData, token);
                        await syncUsersListAfterCreate(queryClient, created);
                      } else {
                        const body: Record<string, unknown> = {
                          name,
                          phone,
                          role,
                          is_shareholder: isShare,
                          share_percentage,
                          balance,
                          due_balance,
                        };
                        if (!isShare && role === "staff") {
                          body.restaurant_id = Number(fd.get("restaurant_id"));
                          body.staff_role = String(fd.get("staff_role") || "waiter");
                        }
                        const created = await apiPost<UserRow>("/api/users/", body, token);
                        await syncUsersListAfterCreate(queryClient, created);
                      }
                      setShowForm(false);
                    } catch (err) {
                      setAddError(err instanceof Error ? err.message : "Could not create user.");
                    } finally {
                      setAddSubmitting(false);
                    }
                  }}
                >
                  <div>
                    <label className="text-sm font-medium text-text-secondary mb-1.5 block">Name *</label>
                    <input
                      name="name"
                      type="text"
                      required
                      placeholder="Full name"
                      className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-text-secondary mb-1.5 block">Phone *</label>
                    <input
                      name="phone"
                      type="text"
                      required
                      placeholder="9876543210"
                      className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="is_sh"
                      type="checkbox"
                      checked={addIsShareholder}
                      onChange={(ev) => setAddIsShareholder(ev.target.checked)}
                      className="rounded border-border"
                    />
                    <label htmlFor="is_sh" className="text-sm font-medium text-text-secondary">
                      Is shareholder
                    </label>
                  </div>
                  {addIsShareholder ? (
                    <p className="text-sm text-text-muted rounded-xl border border-border bg-surface-alt px-4 py-3">
                      Shareholder accounts are not given Owner, Staff, or Customer roles. They sign in with the
                      shareholder portal.
                    </p>
                  ) : (
                    <div>
                      <label className="text-sm font-medium text-text-secondary mb-1.5 block">Role *</label>
                      <select
                        name="role_select"
                        value={addRole}
                        onChange={(ev) => setAddRole(ev.target.value as typeof addRole)}
                        className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                      >
                        <option value="owner">Owner</option>
                        <option value="staff">Staff</option>
                        <option value="customer">Customer</option>
                      </select>
                    </div>
                  )}
                  {!addIsShareholder && addRole === "staff" ? (
                    <>
                      <div>
                        <label className="text-sm font-medium text-text-secondary mb-1.5 block">Restaurant *</label>
                        <select
                          name="restaurant_id"
                          className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                          defaultValue=""
                        >
                          <option value="">Select restaurant</option>
                          {restaurantRows.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-text-secondary mb-1.5 block">Staff position</label>
                        <select
                          name="staff_role"
                          defaultValue="waiter"
                          className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                        >
                          <option value="waiter">Waiter</option>
                          <option value="cashier">Cashier</option>
                          <option value="kitchen">Kitchen</option>
                        </select>
                      </div>
                    </>
                  ) : null}
                  <div>
                    <label className="text-sm font-medium text-text-secondary mb-1.5 block">Share percentage</label>
                    <input
                      name="share_percentage"
                      type="number"
                      step="0.01"
                      defaultValue="0"
                      className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-text-secondary mb-1.5 block" htmlFor="add-image">
                      Image
                    </label>
                    <input
                      id="add-image"
                      name="image"
                      type="file"
                      accept="image/*"
                      className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm file:mr-3 file:border-0 file:bg-primary-50 file:text-primary file:text-xs file:font-semibold file:rounded-lg file:px-3 file:py-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-text-secondary mb-1.5 block">Balance</label>
                    <input
                      name="balance"
                      type="number"
                      step="0.01"
                      defaultValue="0"
                      className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-text-secondary mb-1.5 block">Due balance</label>
                    <input
                      name="due_balance"
                      type="number"
                      step="0.01"
                      defaultValue="0"
                      className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                  {addError ? <p className="text-sm text-error">{addError}</p> : null}
                  <div className="flex gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="flex-1 h-11 rounded-xl border border-border text-sm font-semibold text-text-secondary hover:bg-surface"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={addSubmitting}
                      className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-600 disabled:opacity-60"
                    >
                      {addSubmitting ? "Saving…" : "Save"}
                    </button>
                  </div>
                </form>
              </>
            )}
        </AppModal>
      )}
      {ConfirmDialog}
    </>
  );
}
