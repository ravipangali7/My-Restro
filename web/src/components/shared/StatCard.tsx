import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  trend?: string;
  trendUp?: boolean;
  className?: string;
}

export function StatCard({ icon: Icon, label, value, trend, trendUp, className }: StatCardProps) {
  return (
    <div className={cn("bg-card rounded-xl border border-border p-4 lg:p-5 shadow-sm", className)}>
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center">
          <Icon size={20} className="text-primary" />
        </div>
        {trend && (
          <span className={`text-xs font-semibold ${trendUp ? "text-success" : "text-destructive"}`}>
            {trendUp ? "↑" : "↓"} {trend}
          </span>
        )}
      </div>
      <p className="mt-3 text-sm text-text-secondary">{label}</p>
      <p className="mt-1 text-2xl lg:text-3xl font-display font-bold text-foreground">{value}</p>
    </div>
  );
}
