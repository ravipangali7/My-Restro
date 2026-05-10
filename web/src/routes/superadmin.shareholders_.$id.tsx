import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { StatCard, StatCardsGrid } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ViewField, ViewSection } from "@/components/shared/ViewField";
import { DataTable } from "@/components/shared/DataTable";
import { useTransactions, useUsers, useWithdrawals } from "@/hooks/use-rest-api";
import { ArrowLeft, TrendingUp, Wallet, DollarSign, Receipt } from "lucide-react";

export const Route = createFileRoute("/superadmin/shareholders_/$id")({ component: ShareholderViewPage });

function ShareholderViewPage() {
  const { id } = Route.useParams();
  const { data: users } = useUsers();
  const { data: withdrawals } = useWithdrawals();
  const { data: txns } = useTransactions(null);

  const user = useMemo(() => {
    const list = (users as { id: number }[] | undefined) ?? [];
    return list.find((u) => String(u.id) === id);
  }, [users, id]);

  const userWithdrawals = useMemo(() => {
    if (!user || !withdrawals) return [];
    const uid = (user as { id: number }).id;
    return (withdrawals as { user: number }[]).filter((w) => w.user === uid);
  }, [user, withdrawals]);

  const shareTransactions = useMemo(() => {
    const list = (txns as { category: string }[] | undefined) ?? [];
    return list.filter(
      (t) =>
        t.category === "share_distribution" ||
        t.category === "share_withdrawal" ||
        t.category === "share_balance_adjustment",
    );
  }, [txns]);

  if (!user) {
    return <p className="text-sm text-text-muted">User not found.</p>;
  }

  const u = user as {
    name: string;
    phone: string;
    role: string;
    share_percentage: number;
    balance: number;
    due_balance: number;
  };

  return (
    <>
      <Link to="/superadmin/shareholders" className="flex items-center gap-1 text-sm text-text-secondary hover:text-foreground mb-4">
        <ArrowLeft size={16} /> Back to Shareholders
      </Link>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center">
          <TrendingUp size={24} className="text-primary" />
        </div>
        <div>
          <h2 className="font-display font-bold text-xl text-foreground">{u.name}</h2>
          <p className="text-sm text-text-muted">{u.phone}</p>
        </div>
      </div>
      <StatCardsGrid className="mb-6">
        <StatCard icon={TrendingUp} label="Share %" value={`${u.share_percentage}%`} />
        <StatCard icon={Wallet} label="Balance" value={`₹${Number(u.balance).toLocaleString()}`} />
        <StatCard icon={DollarSign} label="Due Balance" value={`₹${Number(u.due_balance).toLocaleString()}`} />
        <StatCard icon={Receipt} label="Withdrawals" value={userWithdrawals.length} />
      </StatCardsGrid>
      <ViewSection title="Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ViewField label="Phone" value={u.phone} />
          <ViewField label="Role" value={u.role} />
          <ViewField label="Share Percentage" value={`${u.share_percentage}%`} />
        </div>
      </ViewSection>
      <ViewSection title="Withdrawal History">
        <DataTable
          columns={[
            { header: "Amount", accessor: (w) => `₹${Number((w as { amount: number }).amount).toLocaleString()}` },
            { header: "Status", accessor: (w) => <StatusBadge status={(w as { status: string }).status} /> },
            { header: "Remarks", accessor: (w) => (w as { remarks?: string }).remarks ?? "" },
            { header: "Reject Reason", accessor: (w) => (w as { reject_reason?: string }).reject_reason || "—" },
          ]}
          data={userWithdrawals}
        />
      </ViewSection>
      <ViewSection title="Share Transactions (platform-wide)">
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
          data={shareTransactions}
        />
      </ViewSection>
    </>
  );
}
