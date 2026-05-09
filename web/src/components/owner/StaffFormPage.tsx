import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useCreateStaff, useOwnerStaffByRestaurant, useRestaurants, useSearchStaffByPhone, useUpdateStaff } from "@/hooks/use-rest-api";
import { useRestaurantScope } from "@/lib/restaurant-context";

export function StaffFormPage({ staffId }: { staffId?: number }) {
  const isEdit = staffId != null;
  const { restaurantId, restaurantIds, setRestaurantId } = useRestaurantScope();
  const { data: restaurantsRaw = [] } = useRestaurants();
  const restaurants = restaurantsRaw as { id: number; name: string }[];
  const navigate = useNavigate();
  const { allStaff, isPending: staffListsPending } = useOwnerStaffByRestaurant({ enabled: isEdit });
  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();

  const current = useMemo(
    () => (allStaff as { id: number }[]).find((s) => s.id === staffId) ?? null,
    [allStaff, staffId],
  ) as
    | {
        id: number;
        user_phone?: string;
        user_name?: string;
        role?: string;
        joined_at?: string;
        salary?: string | number;
        salary_per_day?: string | number;
        is_suspend?: boolean;
      }
    | null;

  const placementRestaurantId = (current as { restaurant?: number } | null)?.restaurant ?? restaurantId;

  const [phone, setPhone] = useState(current?.user_phone ?? "");
  const [didSearch, setDidSearch] = useState(false);
  const [searchPhone, setSearchPhone] = useState("");
  const search = useSearchStaffByPhone(restaurantId, searchPhone, didSearch && !isEdit && searchPhone.length > 0);

  const [name, setName] = useState(current?.user_name ?? "");
  const [role, setRole] = useState(current?.role ?? "waiter");
  const [joinedAt, setJoinedAt] = useState(current?.joined_at ?? new Date().toISOString().slice(0, 10));
  const [salary, setSalary] = useState(String(current?.salary ?? 0));
  const [salaryPerDay, setSalaryPerDay] = useState(String(current?.salary_per_day ?? 0));
  const [isSuspend, setIsSuspend] = useState(current?.is_suspend ?? false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!current) return;
    setPhone(current.user_phone ?? "");
    setName(current.user_name ?? "");
    setRole(current.role ?? "waiter");
    setJoinedAt(current.joined_at ?? new Date().toISOString().slice(0, 10));
    setSalary(String(current.salary ?? 0));
    setSalaryPerDay(String(current.salary_per_day ?? 0));
    setIsSuspend(current.is_suspend ?? false);
  }, [current]);

  useEffect(() => {
    if (search.data?.found && search.data.user?.name) {
      setName(search.data.user.name);
    }
  }, [search.data]);

  useEffect(() => {
    if (restaurantId != null || restaurantIds.length === 0) return;
    setRestaurantId(restaurantIds[0]!);
  }, [restaurantId, restaurantIds, setRestaurantId]);

  const onFormRestaurantChange = (nextId: number) => {
    setRestaurantId(nextId);
    if (!isEdit) {
      setDidSearch(false);
      setSearchPhone("");
      setError(null);
    }
  };

  /** Matches server seed: monthly salary ÷ 30 days, two decimal places. */
  const dailyFromMonthly = (monthly: number) => {
    if (!Number.isFinite(monthly) || monthly <= 0) return "0";
    return (monthly / 30).toFixed(2);
  };

  const onSalaryChange = (raw: string) => {
    setSalary(raw);
    if (!isEdit) setSalaryPerDay(dailyFromMonthly(Number.parseFloat(raw)));
  };

  if (restaurantIds.length === 0 && restaurantId == null) {
    return <p className="text-sm text-text-muted">No restaurant context.</p>;
  }
  if (restaurantId == null) return <p className="text-sm text-text-muted">Loading…</p>;
  if (isEdit && staffListsPending) return <p className="text-sm text-text-muted">Loading…</p>;
  if (isEdit && !current) return <p className="text-sm text-text-muted">Staff record not found.</p>;

  const saving = createStaff.isPending || updateStaff.isPending;

  const onSubmit = async () => {
    if (!phone.trim()) return setError("Phone is required.");
    if (!name.trim()) return setError("Name is required.");
    setError(null);

    try {
      if (isEdit && staffId != null && placementRestaurantId != null) {
        await updateStaff.mutateAsync({
          staffId,
          restaurantId: placementRestaurantId,
          body: { name, role, joined_at: joinedAt, salary, salary_per_day: salaryPerDay, is_suspend: isSuspend },
        });
      } else {
        await createStaff.mutateAsync({
          restaurantId,
          body: { phone, name, role, joined_at: joinedAt, salary, salary_per_day: salaryPerDay, is_suspend: isSuspend },
        });
      }
      navigate({ to: "/owner/staff" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <h2 className="font-display text-lg font-semibold">{isEdit ? "Edit staff" : "Add staff"}</h2>
        {error && <p className="text-sm text-error">{error}</p>}

        {!isEdit && restaurantIds.length > 1 && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Restaurant *</label>
            <select
              value={restaurantId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") return;
                onFormRestaurantChange(Number.parseInt(v, 10));
              }}
              className="h-11 w-full rounded-xl border border-border bg-card px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {restaurantIds.map((rid) => (
                <option key={rid} value={rid}>
                  {restaurants.find((r) => r.id === rid)?.name ?? `Restaurant #${rid}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {!isEdit && (
          <div className="space-y-2 rounded-xl border border-border p-4">
            <p className="text-sm font-medium">Search by phone number</p>
            <div className="flex gap-2">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className="h-11 flex-1 rounded-xl border border-border px-4 text-sm outline-none focus:border-primary" />
              <button
                type="button"
                onClick={() => {
                  setSearchPhone(phone);
                  setDidSearch(true);
                }}
                className="h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
              >
                {search.isFetching ? "Searching..." : "Search"}
              </button>
            </div>
            {didSearch && search.data?.found && <p className="text-sm text-success">User found</p>}
            {didSearch && !search.isFetching && search.data && !search.data.found && (
              <p className="text-sm text-warning">No user found, create new staff</p>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={isEdit} placeholder="Phone" className="h-11 rounded-xl border border-border px-4 text-sm outline-none focus:border-primary disabled:bg-surface" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="h-11 rounded-xl border border-border px-4 text-sm outline-none focus:border-primary" />
          <select value={role} onChange={(e) => setRole(e.target.value)} className="h-11 rounded-xl border border-border px-4 text-sm outline-none focus:border-primary">
            <option value="waiter">Waiter</option>
            <option value="cashier">Cashier</option>
            <option value="kitchen">Kitchen</option>
          </select>
          <input value={joinedAt} onChange={(e) => setJoinedAt(e.target.value)} type="date" className="h-11 rounded-xl border border-border px-4 text-sm outline-none focus:border-primary" />
          <input value={salary} onChange={(e) => onSalaryChange(e.target.value)} type="number" placeholder="Monthly salary" className="h-11 rounded-xl border border-border px-4 text-sm outline-none focus:border-primary" />
          <input value={salaryPerDay} onChange={(e) => setSalaryPerDay(e.target.value)} type="number" step="0.01" placeholder="Daily salary" className="h-11 rounded-xl border border-border px-4 text-sm outline-none focus:border-primary" />
        </div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isSuspend} onChange={(e) => setIsSuspend(e.target.checked)} />
          Suspended
        </label>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate({ to: "/owner/staff" })} className="h-11 flex-1 rounded-xl border border-border text-sm font-semibold">
            Cancel
          </button>
          <button type="button" disabled={saving} onClick={() => void onSubmit()} className="h-11 flex-1 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {saving ? "Saving..." : isEdit ? "Save changes" : "Create staff"}
          </button>
        </div>
      </div>
    </div>
  );
}
