import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ViewField, ViewSection } from "@/components/shared/ViewField";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useLedgers, useRestaurants, useTransactions } from "@/hooks/use-rest-api";
import { ArrowLeft, ArrowLeftRight } from "lucide-react";

export const Route = createFileRoute("/superadmin/transactions_/$id")({ component: TransactionViewPage });

function TransactionViewPage() {
  const { id } = Route.useParams();
  const { data: txns } = useTransactions(null);
  const { data: restaurants } = useRestaurants();
  const { data: ledgers } = useLedgers(null);

  const txn = useMemo(() => {
    const list = (txns as { id: number }[] | undefined) ?? [];
    return list.find((t) => String(t.id) === id);
  }, [txns, id]);

  const restaurant = useMemo(() => {
    const rid = (txn as { restaurant?: number } | undefined)?.restaurant;
    if (rid == null) return undefined;
    return (restaurants as { id: number; name: string }[] | undefined)?.find((r) => r.id === rid);
  }, [txn, restaurants]);

  const ledger = useMemo(() => {
    const lid = (txn as { ledger?: number } | undefined)?.ledger;
    if (lid == null || !ledgers) return null;
    return (ledgers as { id: number }[]).find((l) => l.id === lid) ?? null;
  }, [txn, ledgers]);

  if (!txn) {
    return <p className="text-sm text-text-muted">Transaction not found.</p>;
  }

  const t = txn as {
    amount: number;
    transaction_type: string;
    payment_status: string;
    category: string;
    remarks?: string;
    is_system: boolean;
  };

  const lg = ledger as { particular: string; amount: number; type: string } | null;

  return (
    <>
      <Link to="/superadmin/transactions" className="flex items-center gap-1 text-sm text-text-secondary hover:text-foreground mb-4">
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
      <ViewSection title="Transaction Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ViewField label="Restaurant" value={restaurant?.name || "—"} />
          <ViewField label="Amount" value={`₹${Number(t.amount).toLocaleString()}`} />
          <ViewField label="Payment Status" value={<StatusBadge status={t.payment_status} />} />
          <ViewField label="Transaction Type" value={<StatusBadge status={t.transaction_type} />} />
          <ViewField label="Category" value={String(t.category).replace(/_/g, " ")} />
          <ViewField label="Remarks" value={t.remarks || "—"} />
          <ViewField label="System" value={t.is_system ? "Yes" : "No"} />
        </div>
      </ViewSection>
      {lg && (
        <ViewSection title="Related Ledger Entry">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ViewField label="Particular" value={lg.particular} />
            <ViewField label="Amount" value={`₹${Number(lg.amount).toLocaleString()}`} />
            <ViewField label="Type" value={<StatusBadge status={lg.type} />} />
          </div>
        </ViewSection>
      )}
    </>
  );
}
