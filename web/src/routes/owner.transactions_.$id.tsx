import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ViewField, ViewSection } from "@/components/shared/ViewField";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useCustomers, useLedgers, useOrders, useSuppliers, useTransactions } from "@/hooks/use-rest-api";
import { resolvePaidOrderForTransaction, type OrderLinkFields } from "@/lib/transaction-order-link";
import { useAuth } from "@/lib/auth-context";
import { restaurantDisplayName } from "@/lib/restaurant-table-column";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { ArrowLeft, ArrowLeftRight } from "lucide-react";

export const Route = createFileRoute("/owner/transactions_/$id")({ component: TransactionViewPage });

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

function TransactionViewPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const { restaurantId, restaurantIds } = useRestaurantScope();
  const ownerMultiVenue = user?.role === "owner" && restaurantIds.length > 1;
  const { data: txns, isLoading: txLoading } = useTransactions(ownerMultiVenue ? null : restaurantId, {
    allOwned: ownerMultiVenue,
  });
  const txn = useMemo(() => {
    const list = (txns as TxnRow[] | undefined) ?? [];
    return list.find((t) => String(t.id) === id);
  }, [txns, id]);
  const rowRestaurantId = txn?.restaurant ?? restaurantId;
  const { data: orders = [] } = useOrders(rowRestaurantId);
  const { data: ledgers } = useLedgers(rowRestaurantId);
  const { data: customers } = useCustomers(rowRestaurantId);
  const { data: suppliers } = useSuppliers(rowRestaurantId);

  const ledger = useMemo(() => {
    const lid = txn?.ledger;
    if (lid == null || !ledgers) return null;
    return (ledgers as { id: number }[]).find((l) => l.id === lid) ?? null;
  }, [txn, ledgers]);

  const paidOrder = useMemo(() => {
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

  if (txLoading) {
    return <p className="text-sm text-text-muted">Loading…</p>;
  }
  if (!txn) {
    return <p className="text-sm text-text-muted">Transaction not found.</p>;
  }

  const t = txn;

  const lg = ledger as { party_type: string; party_id: string; particular: string; amount: number; type: string } | null;

  return (
    <>
      <Link to="/owner/transactions" className="flex items-center gap-1 text-sm text-text-secondary hover:text-foreground mb-4">
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
      {paidOrder && (
        <ViewSection title="Related order">
          <p className="text-xs text-text-muted mb-3">
            This transaction is linked to a customer order. Payment may be completed or still pending.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ViewField label="Order" value={paidOrder.order_id} />
            <ViewField
              label="View order"
              value={
                <Link to="/owner/orders/$id" params={{ id: String(paidOrder.id) }} className="text-sm text-primary font-medium">
                  Open order #{paidOrder.id}
                </Link>
              }
            />
            <ViewField
              label="Order status"
              value={paidOrder.status ? <StatusBadge status={paidOrder.status} /> : "—"}
            />
            <ViewField label="Payment status" value={<StatusBadge status={paidOrder.payment_status} />} />
            <ViewField
              label="Payment method"
              value={paidOrder.payment_method ? <StatusBadge status={paidOrder.payment_method} /> : "—"}
            />
            <ViewField label="Order total" value={`₹${Number(paidOrder.total ?? 0).toLocaleString()}`} />
            {paidOrder.created_at ? (
              <ViewField label="Placed at" value={new Date(paidOrder.created_at).toLocaleString()} />
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
