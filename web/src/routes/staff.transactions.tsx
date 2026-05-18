import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { OwnerEntityCard, ownerListActionClass } from "@/components/owner/OwnerEntityCard";
import { PaginatedList } from "@/components/shared/PaginatedList";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrders, useTransactions } from "@/hooks/use-rest-api";
import { resolvePaidOrderForTransaction, type OrderLinkFields } from "@/lib/transaction-order-link";
import { useAuth } from "@/lib/auth-context";
import { ownerStaffShowsRestaurantColumn } from "@/lib/restaurant-table-column";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { MapPin, Wallet } from "lucide-react";

export const Route = createFileRoute("/staff/transactions")({ component: StaffTransactions });

type TransactionTab = "all" | "in" | "out" | "pending";

interface TxRow {
  id: number;
  amount: string | number;
  payment_status: string;
  transaction_type: string;
  category: string;
  remarks: string;
  restaurant?: number;
  restaurant_name?: string;
}

function StaffTransactions() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { restaurantId } = useRestaurantScope();
  const showRestaurantCol = ownerStaffShowsRestaurantColumn(user);
  const { data = [], isLoading, error } = useTransactions(restaurantId);
  const { data: orders = [] } = useOrders(restaurantId);
  const rows = data as TxRow[];
  const [tab, setTab] = useState<TransactionTab>("all");

  const filteredRows = useMemo(() => {
    if (tab === "all") return rows;
    if (tab === "in") return rows.filter((t) => String(t.transaction_type).toLowerCase() === "in");
    if (tab === "out") return rows.filter((t) => String(t.transaction_type).toLowerCase() === "out");
    return rows.filter((t) => String(t.payment_status).toLowerCase() === "pending");
  }, [rows, tab]);

  if (restaurantId == null) return <p className="text-sm text-text-muted">No restaurant context.</p>;
  if (error) return <p className="text-sm text-error">Failed to load transactions.</p>;
  if (isLoading) return <p className="text-sm text-text-muted">Loading…</p>;

  return (
    <>
      <h2 className="font-display font-semibold text-lg text-foreground mb-4">Transactions</h2>
      <Tabs value={tab} onValueChange={(v) => setTab(v as TransactionTab)} className="mb-4">
        <TabsList className="w-full max-w-md justify-stretch sm:w-auto">
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
        <p className="text-sm text-text-muted">No transactions in this view.</p>
      ) : (
        <PaginatedList
          items={filteredRows}
          resetDeps={[tab]}
          empty={<p className="text-sm text-text-muted">No transactions in this view.</p>}
          renderItem={(t, sel) => {
            const o = resolvePaidOrderForTransaction(t, orders as OrderLinkFields[]);
            const remarks = (t.remarks ?? "").trim();

            return (
              <OwnerEntityCard
                {...(sel.selectable ? sel : {})}
                onClick={() => {
                  void navigate({ to: "/staff/transactions/$id", params: { id: String(t.id) } });
                }}
                leading={
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Wallet strokeWidth={2} aria-hidden />
                  </div>
                }
                title={`₹${Number(t.amount).toLocaleString()}`}
                subtitle={
                  <span className="line-clamp-2 text-text-secondary">
                    {remarks || <span className="text-text-muted">No remarks</span>}
                  </span>
                }
                meta={
                  <>
                    {showRestaurantCol && t.restaurant_name ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
                        <MapPin size={12} className="shrink-0 text-primary" aria-hidden />
                        {t.restaurant_name}
                      </span>
                    ) : null}
                    <StatusBadge status={t.payment_status} />
                    <StatusBadge status={t.transaction_type} />
                    <StatusBadge status={t.category} />
                    {o ? (
                      <span className="text-xs tabular-nums text-text-muted">
                        Order <span className="font-medium text-foreground">{o.order_id}</span>
                        <span className="mx-1">·</span>
                        ₹{Number(o.total).toLocaleString()}
                      </span>
                    ) : null}
                    {o?.payment_method ? <StatusBadge status={o.payment_method} /> : null}
                  </>
                }
                actions={
                  <Link
                    to="/staff/transactions/$id"
                    params={{ id: String(t.id) }}
                    onClick={(e) => e.stopPropagation()}
                    className={ownerListActionClass}
                  >
                    View transaction
                  </Link>
                }
              />
            );
          }}
        />
      )}
    </>
  );
}
