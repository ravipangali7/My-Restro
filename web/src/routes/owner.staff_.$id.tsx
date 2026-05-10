import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { RouteFormModal } from "@/components/shared/RouteFormModal";
import { StatCard, StatCardsGrid } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ViewField, ViewSection } from "@/components/shared/ViewField";
import { DataTable } from "@/components/shared/DataTable";
import { useLedgers, useOrders, useOwnerStaffByRestaurant } from "@/hooks/use-rest-api";
import { restaurantDisplayName } from "@/lib/restaurant-table-column";
import { ArrowLeft, Users, DollarSign, ShoppingBag, Calendar } from "lucide-react";

type StaffListRow = { id: number; user: number; restaurant?: number };

type LedgerRow = { id: number; particular?: string; amount: number; type: string };

export const Route = createFileRoute("/owner/staff_/$id")({ component: StaffViewPage });

function StaffViewPage() {
  const { id } = Route.useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isEditRoute = pathname.endsWith("/edit");
  const { allStaff, isPending } = useOwnerStaffByRestaurant();

  const staff = useMemo(() => {
    const list = (allStaff as StaffListRow[]) ?? [];
    return list.find((s) => String(s.id) === id);
  }, [allStaff, id]);

  const staffRestaurantId = staff?.restaurant ?? null;

  const { data: orders } = useOrders(staffRestaurantId);

  const userId = staff?.user;
  const partyId = userId != null ? String(userId) : null;

  const { data: ledgerRows } = useLedgers(staffRestaurantId, "staff", partyId);
  const ledgerEntries = (ledgerRows as LedgerRow[] | undefined) ?? [];

  const waiterOrders = useMemo(() => {
    if (userId == null || !orders) return [];
    return (orders as { waiter?: number }[]).filter((o) => o.waiter === userId);
  }, [orders, userId]);

  if (isPending) {
    return <p className="text-sm text-text-muted">Loading…</p>;
  }

  if (!staff) {
    return <p className="text-sm text-text-muted">Staff record not found.</p>;
  }

  const s = staff as unknown as {
    role: string;
    is_suspend: boolean;
    joined_at: string;
    salary: number;
    salary_per_day: number;
    user: number;
    restaurant?: number;
    restaurant_name?: string;
  };

  return (
    <>
      <Link to="/owner/staff" className="flex items-center gap-1 text-sm text-text-secondary hover:text-foreground mb-4">
        <ArrowLeft size={16} /> Back to Staff
      </Link>

      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center">
          <Users size={24} className="text-primary" />
        </div>
        <div>
          <h2 className="font-display font-bold text-xl text-foreground">User #{s.user}</h2>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={s.role} />
            <StatusBadge status={s.is_suspend ? "inactive" : "active"} />
          </div>
        </div>
      </div>

      <StatCardsGrid className="mb-6">
        <StatCard icon={DollarSign} label="Salary" value={`₹${Number(s.salary).toLocaleString()}`} />
        <StatCard icon={Calendar} label="Per Day" value={`₹${Number(s.salary_per_day).toLocaleString()}`} />
        <StatCard icon={ShoppingBag} label="Orders Served" value={waiterOrders.length} />
        <StatCard icon={DollarSign} label="Ledger Entries" value={ledgerEntries.length} />
      </StatCardsGrid>

      <ViewSection title="Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ViewField label="Restaurant" value={restaurantDisplayName(s)} />
          <ViewField label="User ID" value={String(s.user)} />
          <ViewField label="Role" value={s.role} />
          <ViewField label="Joined" value={s.joined_at} />
          <ViewField label="Status" value={s.is_suspend ? "Suspended" : "Active"} />
        </div>
      </ViewSection>

      {ledgerEntries.length > 0 && (
        <ViewSection title="Ledger">
          <DataTable<LedgerRow>
            columns={[
              { header: "Particular", accessor: "particular" },
              { header: "Amount", accessor: (l) => `₹${Number(l.amount).toLocaleString()}` },
              { header: "Type", accessor: (l) => <StatusBadge status={l.type} /> },
            ]}
            data={ledgerEntries}
          />
        </ViewSection>
      )}
      {isEditRoute ? (
        <RouteFormModal title="Staff form" onClose={() => navigate({ to: "/owner/staff" })}>
          <Outlet />
        </RouteFormModal>
      ) : null}
    </>
  );
}
