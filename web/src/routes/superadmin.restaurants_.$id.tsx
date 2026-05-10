import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { StatCard, StatCardsGrid } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ViewField, ViewSection } from "@/components/shared/ViewField";
import { DataTable } from "@/components/shared/DataTable";
import { resolveMediaUrl } from "@/lib/api";
import { useOrders, useProducts, useRestaurants, useStaffMembers, useTransactions, useUsers } from "@/hooks/use-rest-api";
import { ArrowLeft, Store, ShoppingBag, Users, DollarSign, MapPin, Package } from "lucide-react";

export const Route = createFileRoute("/superadmin/restaurants_/$id")({ component: RestaurantViewPage });

function RestaurantViewPage() {
  const { id } = Route.useParams();
  const { data: restaurants } = useRestaurants();
  const { data: users } = useUsers();

  const restaurant = useMemo(() => {
    const list = (restaurants as { id: number }[] | undefined) ?? [];
    return list.find((r) => String(r.id) === id);
  }, [restaurants, id]);

  const rid = (restaurant as { id?: number } | undefined)?.id ?? null;

  const { data: orders } = useOrders(rid);
  const { data: transactions } = useTransactions(rid);
  const { data: staff } = useStaffMembers(rid);
  const { data: products } = useProducts(rid);

  const owner = useMemo(() => {
    const uid = (restaurant as { user?: number } | undefined)?.user;
    if (uid == null) return undefined;
    return (users as { id: number; name: string }[] | undefined)?.find((u) => u.id === uid);
  }, [restaurant, users]);

  const totalRevenue = useMemo(() => {
    const t = (transactions as { transaction_type: string; amount: number }[] | undefined) ?? [];
    return t.filter((x) => x.transaction_type === "in").reduce((s, x) => s + Number(x.amount), 0);
  }, [transactions]);

  const staffWithNames = useMemo(() => {
    const list = (staff as { user: number; role: string; salary: number; is_suspend: boolean }[] | undefined) ?? [];
    return list.map((s) => ({
      ...s,
      displayName: (users as { id: number; name: string }[] | undefined)?.find((u) => u.id === s.user)?.name ?? `User #${s.user}`,
    }));
  }, [staff, users]);

  if (!restaurant) {
    return <p className="text-sm text-text-muted">Restaurant not found.</p>;
  }

  const r = restaurant as {
    name: string;
    slug: string;
    logo?: string | null;
    is_open: boolean;
    phone: string;
    address: string;
    due_balance: number;
    per_transaction_fee: number;
    can_delivery: boolean;
    delivery_radius_km?: number;
    subscription_start?: string;
    subscription_end?: string;
    latitude?: number;
    longitude?: number;
  };

  const logoSrc = resolveMediaUrl(r.logo);

  const orderList = (orders as { order_id: string; order_type: string; status: string; total: number }[] | undefined) ?? [];
  const txnList =
    (transactions as { amount: number; transaction_type: string; category: string; payment_status: string }[] | undefined) ?? [];

  return (
    <>
      <Link to="/superadmin/restaurants" className="flex items-center gap-1 text-sm text-text-secondary hover:text-foreground mb-4">
        <ArrowLeft size={16} /> Back to Restaurants
      </Link>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center overflow-hidden border border-border">
          {logoSrc ? (
            <img src={logoSrc} alt="" className="w-full h-full object-cover" />
          ) : (
            <Store size={24} className="text-primary" />
          )}
        </div>
        <div>
          <h2 className="font-display font-bold text-xl text-foreground">{r.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={r.is_open ? "open" : "closed"} />
            <span className="text-sm text-text-muted">{r.slug}</span>
          </div>
        </div>
      </div>
      <StatCardsGrid className="mb-6">
        <StatCard icon={ShoppingBag} label="Total Orders" value={orderList.length} />
        <StatCard icon={DollarSign} label="Revenue (in)" value={`₹${totalRevenue.toLocaleString()}`} trend="—" trendUp />
        <StatCard icon={Users} label="Staff" value={(staff as unknown[] | undefined)?.length ?? 0} />
        <StatCard icon={Package} label="Products" value={(products as unknown[] | undefined)?.length ?? 0} />
      </StatCardsGrid>
      <ViewSection title="Restaurant Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <ViewField label="Owner" value={owner?.name || "—"} />
          <ViewField label="Phone" value={r.phone} />
          <ViewField label="Address" value={r.address || "—"} />
          <ViewField label="Due Balance" value={`₹${Number(r.due_balance).toLocaleString()}`} />
          <ViewField
            label="Per Transaction Fee"
            value={Number(r.per_transaction_fee) > 0 ? `₹${Number(r.per_transaction_fee).toLocaleString()}` : "— (platform default)"}
          />
          <ViewField label="Can Delivery" value={r.can_delivery ? "Yes" : "No"} />
          <ViewField
            label="Delivery Radius"
            value={r.delivery_radius_km != null ? `${Number(r.delivery_radius_km).toLocaleString()} km` : "—"}
          />
          <ViewField label="Subscription" value={`${r.subscription_start ?? "—"} — ${r.subscription_end ?? "—"}`} />
          <ViewField
            label="Location"
            value={
              r.latitude != null && r.longitude != null ? (
                <span className="flex items-center gap-1">
                  <MapPin size={12} className="text-primary" /> {Number(r.latitude).toFixed(4)}, {Number(r.longitude).toFixed(4)}
                </span>
              ) : (
                "—"
              )
            }
          />
        </div>
      </ViewSection>
      <ViewSection title="Recent Orders">
        <DataTable
          columns={[
            { header: "Order ID", accessor: "order_id" },
            { header: "Type", accessor: (o) => <StatusBadge status={(o as { order_type: string }).order_type} /> },
            { header: "Status", accessor: (o) => <StatusBadge status={(o as { status: string }).status} /> },
            { header: "Total", accessor: (o) => `₹${Number((o as { total: number }).total).toLocaleString()}` },
          ]}
          data={orderList.slice(0, 5)}
        />
      </ViewSection>
      <ViewSection title="Recent Transactions">
        <DataTable
          columns={[
            { header: "Amount", accessor: (t) => `₹${Number((t as { amount: number }).amount).toLocaleString()}` },
            { header: "Type", accessor: (t) => <StatusBadge status={(t as { transaction_type: string }).transaction_type} /> },
            {
              header: "Category",
              accessor: (t) => (
                <span className="capitalize text-sm">{String((t as { category: string }).category).replace(/_/g, " ")}</span>
              ),
            },
            { header: "Status", accessor: (t) => <StatusBadge status={(t as { payment_status: string }).payment_status} /> },
          ]}
          data={txnList.slice(0, 5)}
        />
      </ViewSection>
      <ViewSection title="Staff">
        <DataTable
          columns={[
            { header: "Name", accessor: (s) => (s as { displayName: string }).displayName },
            { header: "Role", accessor: (s) => <StatusBadge status={(s as { role: string }).role} /> },
            { header: "Salary", accessor: (s) => `₹${Number((s as { salary: number }).salary).toLocaleString()}` },
            { header: "Status", accessor: (s) => <StatusBadge status={(s as { is_suspend: boolean }).is_suspend ? "inactive" : "active"} /> },
          ]}
          data={staffWithNames}
        />
      </ViewSection>
    </>
  );
}
