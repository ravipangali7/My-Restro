import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PaginatedDataTable } from "@/components/shared/PaginatedDataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useRestaurants, useUsers } from "@/hooks/use-rest-api";
import { apiPost } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { Plus } from "lucide-react";

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
  staff_placements?: StaffPlacement[];
};

export const Route = createFileRoute("/owner/users")({ component: OwnerUsersPage });

function OwnerUsersPage() {
  const { token, user } = useAuth();
  const { restaurantId } = useRestaurantScope();
  const { data: restaurants } = useRestaurants();
  const queryClient = useQueryClient();
  const { data: apiUsers, isLoading } = useUsers();
  const users = (apiUsers as UserRow[] | undefined) ?? [];

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [newUserRole, setNewUserRole] = useState<"owner" | "staff" | "customer">("customer");

  const restaurantRows = (restaurants as { id: number; name: string }[] | undefined) ?? [];
  const ownedIds = user?.restaurant_ids ?? [];

  const openAdd = () => {
    setFormError(null);
    setNewUserRole("customer");
    setShowForm(true);
  };

  if (isLoading) {
    return <p className="text-sm text-text-muted">Loading users…</p>;
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-semibold text-lg text-foreground">Users</h2>
        <button
          type="button"
          onClick={openAdd}
          className="h-10 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary-600 flex items-center gap-1"
        >
          <Plus size={14} /> Add User
        </button>
      </div>

      <PaginatedDataTable
        enableSelection={false}
        columns={[
          { header: "Name", accessor: "name" },
          { header: "Phone", accessor: "phone" },
          { header: "Role", accessor: (u) => <StatusBadge status={u.role} /> },
        ]}
        data={users}
      />

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md max-h-[min(92dvh,calc(100vh-2rem))] overflow-y-auto overscroll-contain shadow-xl">
            <h3 className="font-display font-semibold text-lg text-foreground mb-4">Add User</h3>
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setFormError(null);
                const fd = new FormData(e.currentTarget);
                const name = String(fd.get("name") || "").trim();
                const phone = String(fd.get("phone") || "").trim();
                const role = String(fd.get("role") || "customer");
                const staff_role = String(fd.get("staff_role") || "waiter");
                const body: Record<string, unknown> = { name, phone, role };
                if (role === "staff") {
                  const rid = fd.get("restaurant_id");
                  if (!rid) {
                    setFormError("Select a restaurant for staff.");
                    return;
                  }
                  body.restaurant_id = Number(rid);
                  body.staff_role = staff_role;
                }
                setSubmitting(true);
                try {
                  await apiPost<UserRow>("/api/users/", body, token);
                  await queryClient.invalidateQueries({ queryKey: ["users"] });
                  setShowForm(false);
                } catch (err) {
                  setFormError(err instanceof Error ? err.message : "Could not create user.");
                } finally {
                  setSubmitting(false);
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
                  placeholder="+91 XXXXX XXXXX"
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block">Role *</label>
                <select
                  name="role"
                  value={newUserRole}
                  onChange={(ev) => setNewUserRole(ev.target.value as "owner" | "staff" | "customer")}
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                >
                  <option value="owner">Owner</option>
                  <option value="staff">Staff</option>
                  <option value="customer">Customer</option>
                </select>
              </div>
              {newUserRole === "staff" ? (
                <>
                  <div>
                    <label className="text-sm font-medium text-text-secondary mb-1.5 block">Restaurant *</label>
                    <select
                      name="restaurant_id"
                      defaultValue={restaurantId != null ? String(restaurantId) : ""}
                      className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    >
                      <option value="">Select restaurant</option>
                      {ownedIds.map((id) => {
                        const r = restaurantRows.find((x) => x.id === id);
                        return (
                          <option key={id} value={id}>
                            {r?.name ?? `Restaurant #${id}`}
                          </option>
                        );
                      })}
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
              {formError ? <p className="text-sm text-error">{formError}</p> : null}
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
                  disabled={submitting}
                  className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-600 disabled:opacity-60"
                >
                  {submitting ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
