import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Wallet } from "lucide-react";
import { OwnerEntityCard, OwnerEntityCardStack, ownerListActionClass } from "@/components/owner/OwnerEntityCard";
import { SuperAdminEmptyState, SuperAdminPageHeader } from "@/components/superadmin/super-admin-ui";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRestaurants, useTransactions } from "@/hooks/use-rest-api";

export const Route = createFileRoute("/superadmin/transactions")({ component: TransactionsPage });

type TransactionTab = "all" | "in" | "out" | "pending";

interface TxRow {
  id: number;
  amount: string | number;
  payment_status: string;
  transaction_type: string;
  category: string;
  remarks?: string;
  restaurant: number;
  is_system?: boolean;
  effective_per_transaction_fee?: string | number;
}

function TransactionsPage() {
  const navigate = useNavigate();
  const { data: txns, isLoading } = useTransactions(null);
  const { data: restaurants } = useRestaurants();

  const [tab, setTab] = useState<TransactionTab>("all");

  const rows = (txns as TxRow[] | undefined) ?? [];

  const filteredRows = useMemo(() => {
    if (tab === "all") return rows;
    if (tab === "in") return rows.filter((t) => String(t.transaction_type).toLowerCase() === "in");
    if (tab === "out") return rows.filter((t) => String(t.transaction_type).toLowerCase() === "out");
    return rows.filter((t) => String(t.payment_status).toLowerCase() === "pending");
  }, [rows, tab]);

  const restName = (rid: number) =>
    (restaurants as { id: number; name: string }[] | undefined)?.find((r) => r.id === rid)?.name ?? "—";

  const perTxnFee = (t: TxRow) => {
    const v = t.effective_per_transaction_fee;
    if (v === undefined || v === null) return "—";
    return `₹${Number(v).toLocaleString()}`;
  };

  if (isLoading) {
    return <p className="text-sm text-text-muted">Loading…</p>;
  }

  return (
    <>
      <SuperAdminPageHeader
        title="Transactions"
        description="Platform-wide money movement, per-order fees, and settlement status."
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as TransactionTab)} className="mb-4">
        <TabsList className="w-full max-w-xl justify-stretch sm:w-auto">
          <TabsTrigger value="all" className="flex-1 sm:flex-none">
            All
          </TabsTrigger>
          <TabsTrigger value="in" className="flex-1 sm:flex-none">
            In
          </TabsTrigger>
          <TabsTrigger value="out" className="flex-1 sm:flex-none">
            Out
          </TabsTrigger>
          <TabsTrigger value="pending" className="flex-1 sm:flex-none">
            Pending
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {filteredRows.length === 0 ? (
        <SuperAdminEmptyState>No transactions in this view.</SuperAdminEmptyState>
      ) : (
        <OwnerEntityCardStack>
          {filteredRows.map((t) => {
            const remarks = (t.remarks ?? "").trim();
            return (
              <OwnerEntityCard
                key={t.id}
                onClick={() => {
                  void navigate({ to: "/superadmin/transactions/$id", params: { id: String(t.id) } });
                }}
                leading={
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Wallet strokeWidth={2} aria-hidden />
                  </div>
                }
                title={`₹${Number(t.amount).toLocaleString()}`}
                subtitle={
                  <span className="line-clamp-2 text-text-secondary">
                    <span className="font-medium text-foreground">{restName(t.restaurant)}</span>
                    <span className="text-text-muted"> · </span>
                    Fee {perTxnFee(t)}
                    {remarks ? (
                      <>
                        <span className="text-text-muted"> · </span>
                        {remarks}
                      </>
                    ) : (
                      <span className="text-text-muted"> · No remarks</span>
                    )}
                  </span>
                }
                meta={
                  <>
                    <StatusBadge status={t.payment_status} />
                    <StatusBadge status={t.transaction_type} />
                    <StatusBadge status={t.category} />
                    {t.is_system ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-info/10 text-info">System</span>
                    ) : (
                      <span className="text-xs text-text-muted">Manual</span>
                    )}
                  </>
                }
                actions={
                  <Link
                    to="/superadmin/transactions/$id"
                    params={{ id: String(t.id) }}
                    onClick={(e) => e.stopPropagation()}
                    className={ownerListActionClass}
                  >
                    View transaction
                  </Link>
                }
              />
            );
          })}
        </OwnerEntityCardStack>
      )}
    </>
  );
}
