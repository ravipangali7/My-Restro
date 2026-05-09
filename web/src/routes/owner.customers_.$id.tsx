import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ViewField, ViewSection } from "@/components/shared/ViewField";
import { useCustomers, useLedgers, useOrders } from "@/hooks/use-rest-api";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { money } from "@/lib/money";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/owner/customers_/$id")({ component: CustomerDetail });

interface UserRow {
  id: number;
  name: string;
  phone: string;
  balance: string | number;
}

interface OrderRow {
  id: number;
  order_id: string;
  status: string;
  customer: number | null;
  total: string | number;
}

interface LedgerRow {
  id: number;
  party_type: string;
  party_id: string;
  particular: string;
  amount: string | number;
  type: string;
}

function CustomerDetail() {
  const { id } = Route.useParams();
  const { restaurantId } = useRestaurantScope();
  const { data: customers = [], isLoading: lc } = useCustomers(restaurantId);
  const { data: ordersRaw = [], isLoading: lo } = useOrders(restaurantId);
  const { data: ledgerRaw = [] } = useLedgers(restaurantId, "customer", id);

  const u = useMemo(
    () => (customers as UserRow[]).find((c) => String(c.id) === id),
    [customers, id],
  );

  const orders = useMemo(
    () => (ordersRaw as OrderRow[]).filter((o) => o.customer != null && String(o.customer) === id),
    [ordersRaw, id],
  );

  const ledger = ledgerRaw as LedgerRow[];

  if (lc || lo) {
    return <p className="text-sm text-text-muted">Loading…</p>;
  }
  if (!u) {
    return <p className="text-sm text-error">Customer not found.</p>;
  }

  return (
    <>
      <Link to="/owner/customers" className="flex items-center gap-1 text-sm mb-4">
        <ArrowLeft size={16} /> Back
      </Link>
      <ViewSection title={u.name}>
        <ViewField label="Phone" value={u.phone} />
        <ViewField label="Balance" value={money(u.balance)} />
      </ViewSection>
      <h3 className="font-semibold mt-6 mb-2">Orders</h3>
      <DataTable
        columns={[
          { header: "Order", accessor: "order_id" },
          { header: "Status", accessor: (o) => <StatusBadge status={o.status} /> },
          { header: "Total", accessor: (o) => money(o.total) },
        ]}
        data={orders}
      />
      <h3 className="font-semibold mt-6 mb-2">Ledger</h3>
      <DataTable
        columns={[
          { header: "Particular", accessor: "particular" },
          { header: "Type", accessor: (l) => <StatusBadge status={l.type} /> },
          { header: "Amount", accessor: (l) => money(l.amount) },
        ]}
        data={ledger}
      />
    </>
  );
}
