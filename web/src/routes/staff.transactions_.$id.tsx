import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ViewField, ViewSection } from "@/components/shared/ViewField";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useCustomers, useLedgers, useOrders, useSuppliers, useTransactions } from "@/hooks/use-rest-api";
import { resolvePaidOrderForTransaction, type OrderLinkFields } from "@/lib/transaction-order-link";
import { restaurantDisplayName } from "@/lib/restaurant-table-column";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { ArrowLeft, ArrowLeftRight } from "lucide-react";

export const Route = createFileRoute("/staff/transactions_/$id")({ component: StaffTransactionViewPage });

interface TxnRow {
  id: number;
  amount: number;
  transaction_type: string;
  payment_status: string;
  category: string;
  remarks?: string;
  is_system: boolean;
  ledger?: number;
  restaurant?: number;
  restaurant_name?: string;
}

function StaffTransactionViewPage() {
  const { id } = Route.useParams();
  const { restaurantId } = useRestaurantScope();
  const { data: txns } = useTransactions(restaurantId);
  const { data: orders = [] } = useOrders(restaurantId);
  const { data: ledgers } = useLedgers(restaurantId);
  const { data: customers } = useCustomers(restaurantId);
  const { data: suppliers } = useSuppliers(restaurantId);

  const txn = useMemo(() => {
    const list = (txns as TxnRow[] | undefined) ?? [];
    return list.find((t) => String(t.id) === id);
  }, [txns, id]);

  const ledger = useMemo(() => {
    const lid = txn?.ledger;
    if (lid == null || !ledgers) return null;
    return (ledgers as { id: number }[]).find((l) => l.id === lid) ?? null;
  }, [txn, ledgers]);

  const relatedOrder = useMemo(() => {
    if (!txn) return null;
    return resolvePaidOrderForTransaction(txn, orders as OrderLinkFields[]);
  }, [txn, orders]);

  const resolveParty = (type: string, pid: string) => {
    if (type === "customer") {
      const c = (customers as { id: number; name?: string; phone?: string }[] | undefined)?.find(
        (u) => String(u.id) === pid,
      );
      return c?.name || c?.phone || pid;
    }
    if (type === "staff") return `User #${pid}`;
    if (type === "supplier") {
      const s = (suppliers as { id: number; name: string }[] | undefined)?.find((x) => String(x.id) === pid);
      return s?.name || pid;
    }
    return pid;
  };

  if (!txn) {
    return <p className="text-sm text-text-muted">Transaction not found.</p>;
  }

  const t = txn;

  const lg = ledger as { party_type: string; party_id: string; particular: string; amount: number; type: string } | null;

  return (
    <>
      <Link to="/staff/transactions" className="flex items-center gap-1 text-sm text-text-secondary hover:text-foreground mb-4">
        <ArrowLeft size={16} /> Back to Transactions
      </Link>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center">
          <ArrowLeftRight size={24} className="text-primary" />
        </div>
        <div>
          <h2 className="font-display font-bold text-xl text-foreground">₹{Number(t.amount).toLocaleString()}</h2>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={t.transaction_type} />
            <StatusBadge status={t.payment_status} />
          </div>
        </div>
      </div>
      <ViewSection title="Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ViewField label="Restaurant" value={restaurantDisplayName(t)} />
          <ViewField label="Amount" value={`₹${Number(t.amount).toLocaleString()}`} />
          <ViewField label="Payment Status" value={<StatusBadge status={t.payment_status} />} />
          <ViewField label="Flow" value={<StatusBadge status={t.transaction_type} />} />
          <ViewField label="Category" value={String(t.category).replace(/_/g, " ")} />
          <ViewField label="Remarks" value={t.remarks || "—"} />
          <ViewField label="System" value={t.is_system ? "Yes" : "No"} />
        </div>
      </ViewSection>
      {relatedOrder && (
        <ViewSection title="Related order">
          <p className="text-xs text-text-muted mb-3">
            Linked customer order (payment may be success or pending). Amount reflects the order total.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ViewField label="Order" value={relatedOrder.order_id} />
            <ViewField
              label="Order status"
              value={relatedOrder.status ? <StatusBadge status={relatedOrder.status} /> : "—"}
            />
            <ViewField label="Payment status" value={<StatusBadge status={relatedOrder.payment_status} />} />
            <ViewField
              label="Payment method"
              value={relatedOrder.payment_method ? <StatusBadge status={relatedOrder.payment_method} /> : "—"}
            />
            <ViewField label="Order total" value={`₹${Number(relatedOrder.total ?? 0).toLocaleString()}`} />
            {relatedOrder.created_at ? (
              <ViewField label="Placed at" value={new Date(relatedOrder.created_at).toLocaleString()} />
            ) : null}
          </div>
        </ViewSection>
      )}
      {lg && (
        <ViewSection title="Related Ledger">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ViewField label="Party" value={resolveParty(lg.party_type, lg.party_id)} />
            <ViewField label="Particular" value={lg.particular} />
            <ViewField label="Amount" value={`₹${Number(lg.amount).toLocaleString()}`} />
            <ViewField label="Type" value={<StatusBadge status={lg.type} />} />
          </div>
        </ViewSection>
      )}
    </>
  );
}
