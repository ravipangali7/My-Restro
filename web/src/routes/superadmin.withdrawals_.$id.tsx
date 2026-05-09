import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ViewField, ViewSection } from "@/components/shared/ViewField";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useUsers, useWithdrawals } from "@/hooks/use-rest-api";
import { ArrowLeft, Wallet } from "lucide-react";

export const Route = createFileRoute("/superadmin/withdrawals_/$id")({ component: WithdrawalViewPage });

function WithdrawalViewPage() {
  const { id } = Route.useParams();
  const { data: withdrawals } = useWithdrawals();
  const { data: users } = useUsers();

  const withdrawal = useMemo(() => {
    const list = (withdrawals as { id: number }[] | undefined) ?? [];
    return list.find((w) => String(w.id) === id);
  }, [withdrawals, id]);

  const user = useMemo(() => {
    const uid = (withdrawal as { user?: number } | undefined)?.user;
    if (uid == null) return undefined;
    return (users as { id: number; name: string; phone: string; balance: number; share_percentage: number; due_balance: number }[] | undefined)?.find(
      (u) => u.id === uid,
    );
  }, [withdrawal, users]);

  if (!withdrawal) {
    return <p className="text-sm text-text-muted">Withdrawal not found.</p>;
  }

  const w = withdrawal as { amount: number; status: string; remarks?: string; reject_reason?: string };

  return (
    <>
      <Link to="/superadmin/withdrawals" className="flex items-center gap-1 text-sm text-text-secondary hover:text-foreground mb-4">
        <ArrowLeft size={16} /> Back to Withdrawals
      </Link>

      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center">
          <Wallet size={24} className="text-primary" />
        </div>
        <div>
          <h2 className="font-display font-bold text-xl text-foreground">₹{Number(w.amount).toLocaleString()}</h2>
          <StatusBadge status={w.status} />
        </div>
      </div>

      <ViewSection title="Withdrawal Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ViewField label="Shareholder" value={user?.name || "—"} />
          <ViewField label="Phone" value={user?.phone || "—"} />
          <ViewField label="Amount" value={`₹${Number(w.amount).toLocaleString()}`} />
          <ViewField label="Status" value={<StatusBadge status={w.status} />} />
          <ViewField label="Remarks" value={w.remarks || "—"} />
          <ViewField label="Reject Reason" value={w.reject_reason || "—"} />
        </div>
      </ViewSection>

      {user && (
        <ViewSection title="Shareholder Info">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ViewField label="Balance" value={`₹${Number(user.balance).toLocaleString()}`} />
            <ViewField label="Share %" value={`${user.share_percentage}%`} />
            <ViewField label="Due Balance" value={`₹${Number(user.due_balance).toLocaleString()}`} />
          </div>
        </ViewSection>
      )}
    </>
  );
}
