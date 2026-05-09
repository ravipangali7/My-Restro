const statusStyles: Record<string, string> = {
  pending: "bg-warning-bg text-warning",
  accepted: "bg-info-bg text-info",
  running: "bg-[#F3EEFF] text-status-running",
  ready: "bg-success-bg text-success",
  waiting_pickup: "bg-teal-50 text-teal-800 ring-1 ring-teal-200/80",
  delivered: "bg-slate-100 text-slate-700 ring-1 ring-slate-200/80",
  rejected: "bg-error-bg text-error",
  success: "bg-success-bg text-success",
  partial: "bg-warning-bg text-warning",
  failed: "bg-error-bg text-error",
  qr: "bg-info-bg text-info",
  cash: "bg-slate-100 text-slate-700 ring-1 ring-slate-200/80",
  e_wallet: "bg-[#F3EEFF] text-status-running",
  approved: "bg-success-bg text-success",
  active: "bg-success-bg text-success",
  inactive: "bg-error-bg text-error",
  open: "bg-success-bg text-success",
  closed: "bg-error-bg text-error",
  in: "bg-success-bg text-success",
  out: "bg-error-bg text-error",
  debit: "bg-error-bg text-error",
  credit: "bg-success-bg text-success",
  veg: "bg-success-bg text-success",
  "non-veg": "bg-error-bg text-error",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const key = status.toLowerCase();
  const style = statusStyles[key] || "bg-muted text-muted-foreground";
  const label = status.replace(/_/g, " ");
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${style} ${className}`}>
      {label}
    </span>
  );
}
