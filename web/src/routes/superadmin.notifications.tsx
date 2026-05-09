import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useBulkNotifications, useCreateSuperadminBulkNotification, useUsers } from "@/hooks/use-rest-api";

type BulkRow = {
  id: number;
  restaurant: number | null;
  restaurant_name?: string;
  message: string;
  receivers: unknown[];
  type: string;
};

type UserRow = { id: number; name: string; phone: string; role: string; is_shareholder?: boolean; is_active?: boolean };

function isEligibleBulkReceiver(u: UserRow): boolean {
  if (u.role === "super_admin") return false;
  if (u.is_active === false) return false;
  return true;
}

function receiverPickGroup(u: UserRow): "shareholders" | "owners" | "staff" | "customers" {
  if (u.is_shareholder) return "shareholders";
  if (u.role === "owner") return "owners";
  if (u.role === "staff") return "staff";
  return "customers";
}

function sortUsersByName(a: UserRow, b: UserRow) {
  return (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" });
}

export const Route = createFileRoute("/superadmin/notifications")({ component: NotificationsPage });

function NotificationsPage() {
  const { data: users } = useUsers();
  const { data: bulkList, isLoading } = useBulkNotifications(null);
  const createBulk = useCreateSuperadminBulkNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [notifType, setNotifType] = useState<"sms" | "push">("sms");
  const [message, setMessage] = useState("");
  const [receiverScope, setReceiverScope] = useState<"all" | "pick">("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const rows = (bulkList as BulkRow[] | undefined) ?? [];

  const eligibleReceivers = useMemo(() => {
    const list = (users as UserRow[] | undefined) ?? [];
    return list.filter(isEligibleBulkReceiver).sort(sortUsersByName);
  }, [users]);

  const shareholders = useMemo(
    () => eligibleReceivers.filter((u) => receiverPickGroup(u) === "shareholders").sort(sortUsersByName),
    [eligibleReceivers],
  );
  const owners = useMemo(
    () => eligibleReceivers.filter((u) => receiverPickGroup(u) === "owners").sort(sortUsersByName),
    [eligibleReceivers],
  );
  const staff = useMemo(
    () => eligibleReceivers.filter((u) => receiverPickGroup(u) === "staff").sort(sortUsersByName),
    [eligibleReceivers],
  );
  const customers = useMemo(
    () => eligibleReceivers.filter((u) => receiverPickGroup(u) === "customers").sort(sortUsersByName),
    [eligibleReceivers],
  );

  const onReceiversChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const opts = [...e.target.selectedOptions];
    setSelectedIds(opts.map((o) => Number(o.value)));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    const trimmed = message.trim();
    if (!trimmed) {
      setFormError("Please enter a message.");
      return;
    }
    if (receiverScope === "pick" && selectedIds.length === 0) {
      setFormError("Choose at least one recipient, or switch receivers to All.");
      return;
    }

    const imageFile = fileInputRef.current?.files?.[0] ?? null;

    createBulk.mutate(
      {
        message: trimmed,
        type: notifType,
        receiver_user_ids: receiverScope === "all" ? undefined : selectedIds,
        image: imageFile || undefined,
      },
      {
        onSuccess: (data) => {
          setMessage("");
          setSelectedIds([]);
          setReceiverScope("all");
          if (fileInputRef.current) fileInputRef.current.value = "";
          const d = data as { sms_delivery?: { sent: number; skipped_no_phone: number; failed: number } };
          if (d.sms_delivery) {
            const { sent, skipped_no_phone, failed } = d.sms_delivery;
            setFormSuccess(
              `Sent. SMS: ${sent} delivered, ${skipped_no_phone} skipped (no phone), ${failed} failed to send.`,
            );
          } else {
            setFormSuccess("Notification saved.");
          }
        },
        onError: (err) => {
          setFormError(err instanceof Error ? err.message : "Request failed.");
        },
      },
    );
  };

  if (isLoading) {
    return <p className="text-sm text-text-muted">Loading…</p>;
  }

  return (
    <>
      <h2 className="font-display font-semibold text-lg text-foreground mb-4">Bulk Notifications</h2>

      <form
        onSubmit={onSubmit}
        className="bg-card rounded-xl border border-border p-5 mb-6"
      >
        <h3 className="font-display font-semibold text-md text-foreground mb-4">Send Notification</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-text-secondary mb-1.5 block">Type</label>
            <div className="flex gap-1 p-1 rounded-xl bg-surface h-11 max-w-md">
              {(["sms", "push"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setNotifType(t)}
                  className={`flex-1 rounded-lg text-xs font-semibold uppercase transition-all ${
                    notifType === t ? "bg-primary text-primary-foreground shadow-sm" : "text-text-secondary hover:text-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-text-secondary mb-1.5 block">Message</label>
            <textarea
              value={message}
              onChange={(ev) => setMessage(ev.target.value)}
              rows={3}
              placeholder="Enter notification message…"
              className="w-full px-4 py-3 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none resize-none"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-text-secondary mb-1.5 block">Receivers</label>
            <select
              value={receiverScope}
              onChange={(ev) => {
                const v = ev.target.value as "all" | "pick";
                setReceiverScope(v);
                if (v === "all") setSelectedIds([]);
                setFormError(null);
              }}
              className="w-full max-w-md h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none mb-3"
            >
              <option value="all">All — owners, staff, customers, and shareholders (everyone except super admins)</option>
              <option value="pick">Selected individuals…</option>
            </select>
            {receiverScope === "pick" ? (
              <p className="text-xs text-text-muted mb-2">
                Hold Ctrl (Windows) or ⌘ (Mac) to select multiple. Super admins are not listed. Scroll the list to browse
                users.
              </p>
            ) : null}
            {receiverScope === "pick" ? (
              <select
                multiple
                value={selectedIds.map(String)}
                onChange={onReceiversChange}
                size={14}
                className="w-full max-w-xl max-h-72 overflow-y-auto rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none py-2"
              >
                {shareholders.length > 0 ? (
                  <optgroup label="Shareholders">
                    {shareholders.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.phone || `User #${u.id}`} ({u.phone || "no phone"})
                        {u.role === "owner" ? " · owner" : u.role === "staff" ? " · staff" : ""}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {owners.length > 0 ? (
                  <optgroup label="Restaurant owners">
                    {owners.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.phone || `User #${u.id}`} ({u.phone || "no phone"})
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {staff.length > 0 ? (
                  <optgroup label="Staff">
                    {staff.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.phone || `User #${u.id}`} ({u.phone || "no phone"})
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {customers.length > 0 ? (
                  <optgroup label="Customers">
                    {customers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.phone || `User #${u.id}`} ({u.phone || "no phone"})
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            ) : null}
            {receiverScope === "pick" && eligibleReceivers.length === 0 ? (
              <p className="text-xs text-text-muted mt-2">No eligible users in the directory yet.</p>
            ) : null}
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-text-secondary mb-1.5 block">Image (optional)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm file:mr-3 file:border-0 file:bg-primary-50 file:text-primary file:text-xs file:font-semibold file:rounded-lg file:px-3 file:py-1"
            />
          </div>
        </div>
        {formError ? <p className="mt-3 text-sm text-red-600">{formError}</p> : null}
        {formSuccess ? <p className="mt-3 text-sm text-emerald-700">{formSuccess}</p> : null}
        <button
          type="submit"
          disabled={createBulk.isPending}
          className="mt-4 h-11 px-6 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary-600 transition-all disabled:opacity-60"
        >
          {createBulk.isPending ? "Sending…" : "Send Notification"}
        </button>
      </form>

      <h3 className="font-display font-semibold text-md text-foreground mb-3">Notification History</h3>
      <DataTable
        columns={[
          { header: "Restaurant", accessor: (n) => n.restaurant_name ?? "—" },
          { header: "Message", accessor: (n) => <span className="text-sm line-clamp-2">{n.message}</span> },
          { header: "Type", accessor: (n) => <StatusBadge status={n.type} /> },
          {
            header: "Receivers",
            accessor: (n) => {
              const count = Array.isArray(n.receivers) ? n.receivers.length : 0;
              const label =
                count === 0 && n.restaurant == null
                  ? "All platform users"
                  : count === 0
                    ? "All staff"
                    : `${count} selected`;
              return <span className="text-xs text-text-muted">{label}</span>;
            },
          },
          {
            header: "Actions",
            accessor: (n) => (
              <Link
                to="/superadmin/notifications/$id"
                params={{ id: String(n.id) }}
                className="px-2 py-1 text-xs rounded-lg bg-primary-50 text-primary font-medium hover:bg-primary-100"
              >
                View
              </Link>
            ),
          },
        ]}
        data={rows}
      />
    </>
  );
}
