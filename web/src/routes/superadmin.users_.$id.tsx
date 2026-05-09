import { useQueries } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ViewField, ViewSection } from "@/components/shared/ViewField";
import { DataTable } from "@/components/shared/DataTable";
import { apiGet, resolveMediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useRestaurants, useUsers, useWithdrawals } from "@/hooks/use-rest-api";
import { ArrowLeft, User, ShoppingBag, DollarSign, TrendingUp, Wallet } from "lucide-react";

export const Route = createFileRoute("/superadmin/users_/$id")({ component: UserViewPage });

function UserViewPage() {
  const { id } = Route.useParams();
  const { token } = useAuth();
  const { data: users } = useUsers();
  const { data: restaurants } = useRestaurants();
  const { data: withdrawals } = useWithdrawals();

  const user = useMemo(() => {
    const list = (users as { id: number }[] | undefined) ?? [];
    return list.find((u) => String(u.id) === id);
  }, [users, id]);

  const ownedRestaurants = useMemo(() => {
    if (!user || !restaurants) return [];
    const uid = (user as { id: number }).id;
    return (restaurants as { user: number }[]).filter((r) => r.user === uid);
  }, [user, restaurants]);

  const ownedIds = useMemo(() => ownedRestaurants.map((r) => (r as { id: number }).id).slice(0, 10), [ownedRestaurants]);

  const orderQueries = useQueries({
    queries: ownedIds.map((rid) => ({
      queryKey: ["orders", "super-user", rid, token],
      queryFn: () => apiGet<unknown[]>(`/api/orders/?restaurant_id=${rid}`, token),
      enabled: Boolean(token) && ownedIds.length > 0,
    })),
  });

  const ordersFlat = useMemo(() => {
    const rows: { order_id: string; status: string; total: number }[] = [];
    for (const q of orderQueries) {
      const data = q.data as { order_id: string; status: string; total: number }[] | undefined;
      if (data) rows.push(...data);
    }
    return rows.slice(0, 20);
  }, [orderQueries]);

  const userWithdrawals = useMemo(() => {
    if (!user || !withdrawals) return [];
    const uid = (user as { id: number }).id;
    return (withdrawals as { user: number }[]).filter((w) => w.user === uid);
  }, [user, withdrawals]);

  if (!user) {
    return <p className="text-sm text-text-muted">User not found.</p>;
  }

  const u = user as {
    name: string;
    phone: string;
    role: string;
    is_shareholder: boolean;
    share_percentage: number;
    balance: number;
    due_balance: number;
    image?: string | null;
    staff_placements?: { restaurant_id: number; restaurant_name: string; staff_role: string }[];
  };
  const staffPlacements = u.staff_placements ?? [];
  const avatarSrc = resolveMediaUrl(u.image);

  return (
    <>
      <Link to="/superadmin/users" className="flex items-center gap-1 text-sm text-text-secondary hover:text-foreground mb-4">
        <ArrowLeft size={16} /> Back to Users
      </Link>

      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center overflow-hidden border border-border shrink-0">
          {avatarSrc ? (
            <img src={avatarSrc} alt="" className="w-full h-full object-cover" />
          ) : (
            <User size={24} className="text-primary" />
          )}
        </div>
        <div>
          <h2 className="font-display font-bold text-xl text-foreground">{u.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={u.role} />
            {u.is_shareholder && <StatusBadge status="active" className="!bg-info/10 !text-info" />}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={Wallet} label="Balance" value={`₹${Number(u.balance).toLocaleString()}`} />
        <StatCard icon={DollarSign} label="Due Balance" value={`₹${Number(u.due_balance).toLocaleString()}`} />
        <StatCard icon={ShoppingBag} label="Orders (loaded)" value={ordersFlat.length} />
        <StatCard icon={TrendingUp} label="Share %" value={`${u.share_percentage}%`} />
      </div>

      <ViewSection title="User Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <ViewField label="Phone" value={u.phone} />
          <ViewField label="Role" value={u.role} />
          <ViewField label="Shareholder" value={u.is_shareholder ? "Yes" : "No"} />
          <ViewField label="Share %" value={`${u.share_percentage}%`} />
          <ViewField label="FCM Token" value="—" />
        </div>
      </ViewSection>

      {staffPlacements.length > 0 && (
        <ViewSection title="Staff assignments">
          <DataTable
            columns={[
              { header: "Restaurant", accessor: (p) => (p as { restaurant_name: string }).restaurant_name },
              { header: "Position", accessor: (p) => <StatusBadge status={(p as { staff_role: string }).staff_role} /> },
            ]}
            data={staffPlacements}
          />
        </ViewSection>
      )}

      {ownedRestaurants.length > 0 && (
        <ViewSection title="Owned Restaurants">
          <DataTable
            columns={[
              { header: "Name", accessor: "name" },
              { header: "Status", accessor: (r) => <StatusBadge status={(r as { is_open: boolean }).is_open ? "open" : "closed"} /> },
              { header: "Due", accessor: (r) => `₹${Number((r as { due_balance: number }).due_balance).toLocaleString()}` },
            ]}
            data={ownedRestaurants}
          />
        </ViewSection>
      )}

      {userWithdrawals.length > 0 && (
        <ViewSection title="Withdrawals">
          <DataTable
            columns={[
              { header: "Amount", accessor: (w) => `₹${Number((w as { amount: number }).amount).toLocaleString()}` },
              { header: "Status", accessor: (w) => <StatusBadge status={(w as { status: string }).status} /> },
            ]}
            data={userWithdrawals}
          />
        </ViewSection>
      )}

      {ordersFlat.length > 0 && (
        <ViewSection title="Recent orders (from owned restaurants)">
          <DataTable
            columns={[
              { header: "Order ID", accessor: "order_id" },
              { header: "Status", accessor: (o) => <StatusBadge status={(o as { status: string }).status} /> },
              { header: "Total", accessor: (o) => `₹${Number((o as { total: number }).total).toLocaleString()}` },
            ]}
            data={ordersFlat.slice(0, 5)}
          />
        </ViewSection>
      )}
    </>
  );
}
