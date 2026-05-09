import type { ReactNode } from "react";

interface ViewFieldProps {
  label: string;
  value: ReactNode;
  className?: string;
}

export function ViewField({ label, value, className = "" }: ViewFieldProps) {
  return (
    <div className={`bg-card rounded-xl border border-border p-4 ${className}`}>
      <label className="text-xs text-text-muted block mb-1">{label}</label>
      <div className="text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

interface ViewSectionProps {
  title: string;
  children: ReactNode;
}

export function ViewSection({ title, children }: ViewSectionProps) {
  return (
    <div className="mb-6">
      <h3 className="font-display font-semibold text-md text-foreground mb-3">{title}</h3>
      {children}
    </div>
  );
}
