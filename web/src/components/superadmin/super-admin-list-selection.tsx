import { Link, type LinkProps } from "@tanstack/react-router";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  ownerListActionClass,
  ownerListActionDangerClass,
} from "@/components/owner/OwnerEntityCard";
import type { ListItemSelectionProps } from "@/hooks/use-list-selection";
import { cn } from "@/lib/utils";

/** Passed from `PaginatedList` for typing; row actions stay enabled regardless of selection. */
export type SuperAdminRowSelection = ListItemSelectionProps | { selectable?: false };

type SuperAdminRowLinkProps = LinkProps & {
  sel?: SuperAdminRowSelection;
  className?: string;
  children: ReactNode;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
};

export function SuperAdminRowLink({ className, children, onClick, ...linkProps }: SuperAdminRowLinkProps) {
  return (
    <Link
      {...linkProps}
      className={className ?? ownerListActionClass}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
    >
      {children}
    </Link>
  );
}

type SuperAdminRowButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  sel?: SuperAdminRowSelection;
  variant?: "default" | "danger";
};

export function SuperAdminRowButton({
  variant = "default",
  className,
  onClick,
  ...props
}: SuperAdminRowButtonProps) {
  const base = className ?? (variant === "danger" ? ownerListActionDangerClass : ownerListActionClass);
  return (
    <button
      type="button"
      {...props}
      className={base}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
    />
  );
}

export function SuperAdminBulkToolbarButton({
  className,
  variant = "default",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "danger" }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex h-9 items-center rounded-lg border px-3 text-xs font-semibold transition-colors disabled:opacity-40",
        variant === "danger"
          ? "border-error/35 text-error hover:bg-error/10"
          : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/[0.06]",
        className,
      )}
    />
  );
}
