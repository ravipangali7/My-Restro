import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { OwnerEntityCard, ownerListActionClass } from "@/components/owner/OwnerEntityCard";
import { PaginatedList } from "@/components/shared/PaginatedList";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrders, useOrdersAcrossRestaurantIds, useRestaurants, useTransactions } from "@/hooks/use-rest-api";
import { resolvePaidOrderForTransaction, type OrderLinkFields } from "@/lib/transaction-order-link";
import { useAuth } from "@/lib/auth-context";
import { ownerStaffShowsRestaurantColumn } from "@/lib/restaurant-table-column";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { MapPin, Wallet } from "lucide-react";

export const Route = createFileRoute("/owner/transactions")({ component: TransactionsPage });

type TransactionTab = "all" | "in" | "out" | "pending";

interface TxRow {
  id: number;
  amount: string | number;
  payment_status: string;
  transaction_type: string;
  category: string;
  remarks: string;
  restaurant: number;
  restaurant_name?: string;
}

type OrderWithVenue = OrderLinkFields & { restaurant?: number };

function TransactionsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { restaurantId, restaurantIds } = useRestaurantScope();
  const { data: restaurants } = useRestaurants();
  const ownerMultiVenue = user?.role === "owner" && restaurantIds.length > 1;
  const showRestaurantCol = ownerStaffShowsRestaurantColumn(user) || ownerMultiVenue;
  const { data = [], isLoading, error } = useTransactions(ownerMultiVenue ? null : restaurantId, {
    allOwned: ownerMultiVenue,
  });
  const { data: ordersSingle = [] } = useOrders(ownerMultiVenue ? null : restaurantId);
  const multiOrderQueries = useOrdersAcrossRestaurantIds(restaurantIds, ownerMultiVenue);
  const ordersLoadingMulti = ownerMultiVenue && multiOrderQueries.some((q) => q.isPending);
  const orders = useMemo(() => {
    if (ownerMultiVenue) {
      return multiOrderQueries.flatMap((q) => (Array.isArray(q.data) ? q.data : [])) as OrderWithVenue[];
    }
    return ordersSingle as OrderWithVenue[];
  }, [ownerMultiVenue, multiOrderQueries, ordersSingle]);
  const rows = data as TxRow[];
  const [tab, setTab] = useState<TransactionTab>("all");
  const [restaurantScope, setRestaurantScope] = useState<number | "all">("all");

  useEffect(() => {
    if (restaurantIds.length === 1) {
      setRestaurantScope(restaurantIds[0]!);
      return;
    }
    setRestaurantScope((prev) => {
      if (prev === "all") return "all";
      if (typeof prev === "number" && restaurantIds.includes(prev)) return prev;
      return "all";
    });
  }, [restaurantIds]);

  const restaurantNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of (restaurants as { id: number; name: string }[] | undefined) ?? []) {
      m.set(r.id, r.name);
    }
    for (const id of restaurantIds) {
      if (!m.has(id)) m.set(id, `Restaurant #${id}`);
    }
    return m;
  }, [restaurants, restaurantIds]);

  const activeRestaurantFilter = restaurantScope === "all" ? null : restaurantScope;

  const ordersForLinks = useMemo(() => {
    if (!ownerMultiVenue || activeRestaurantFilter == null) return orders;
    return orders.filter((o) => (o.restaurant ?? activeRestaurantFilter) === activeRestaurantFilter);
  }, [ownerMultiVenue, orders, activeRestaurantFilter]);

  const filteredRows = useMemo(() => {
    const scoped =
      activeRestaurantFilter == null ? rows : rows.filter((t) => Number(t.restaurant) === activeRestaurantFilter);
    if (tab === "all") return scoped;
    if (tab === "in") return scoped.filter((t) => String(t.transaction_type).toLowerCase() === "in");
    if (tab === "out") return scoped.filter((t) => String(t.transaction_type).toLowerCase() === "out");
    return scoped.filter((t) => String(t.payment_status).toLowerCase() === "pending");
  }, [rows, tab, activeRestaurantFilter]);

  if (!ownerMultiVenue && restaurantId == null) return <p className="text-sm text-text-muted">No restaurant context.</p>;
  if (ownerMultiVenue && restaurantIds.length === 0) {
    return <p className="text-sm text-text-muted">No restaurants on this account.</p>;
  }
  if (error) return <p className="text-sm text-error">Failed to load transactions.</p>;
  if (isLoading || ordersLoadingMulti) return <p className="text-sm text-text-muted">Loading…</p>;

  return (
    <>
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="font-display font-semibold text-lg text-foreground">Transactions</h2>
        {restaurantIds.length > 1 ? (
          <div className="w-full sm:w-72 shrink-0">
            <label htmlFor="owner-tx-restaurant" className="mb-1.5 block text-sm font-medium text-text-secondary">
              Restaurant
            </label>
            <select
              id="owner-tx-restaurant"
              value={restaurantScope === "all" ? "all" : String(restaurantScope)}
              onChange={(e) => {
                const v = e.target.value;
                setRestaurantScope(v === "all" ? "all" : Number.parseInt(v, 10));
              }}
              className="h-11 w-full rounded-xl border border-border bg-card px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">All restaurants</option>
              {restaurantIds.map((rid) => (
                <option key={rid} value={rid}>
                  {restaurantNameById.get(rid) ?? `Restaurant #${rid}`}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
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
          resetDeps={[tab, restaurantScope]}
          empty={<p className="text-sm text-text-muted">No transactions in this view.</p>}
          renderItem={(t, sel) => {
            const o = resolvePaidOrderForTransaction(t, ordersForLinks);
            const remarks = (t.remarks ?? "").trim();
            return (
              <OwnerEntityCard
                {...(sel.selectable ? sel : {})}
                onClick={() => {
                  void navigate({ to: "/owner/transactions/$id", params: { id: String(t.id) } });
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
                  </>
                }
                actions={
                  <>
                    <Link
                      to="/owner/transactions/$id"
                      params={{ id: String(t.id) }}
                      onClick={(e) => e.stopPropagation()}
                      className={ownerListActionClass}
                    >
                      View transaction
                    </Link>
                    {o ? (
                      <Link
                        to="/owner/orders/$id"
                        params={{ id: String(o.id) }}
                        onClick={(e) => e.stopPropagation()}
                        className={ownerListActionClass}
                      >
                        Order {o.order_id}
                      </Link>
                    ) : null}
                  </>
                }
              />
            );
          }}
        />
      )}
    </>
  );
}
