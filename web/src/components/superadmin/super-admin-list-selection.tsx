import { Link, type LinkProps } from "@tanstack/react-router";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  ownerListActionClass,
  ownerListActionDangerClass,
} from "@/components/owner/OwnerEntityCard";
import type { ListItemSelectionProps } from "@/hooks/use-list-selection";
import { cn } from "@/lib/utils";

export type SuperAdminRowSelection = ListItemSelectionProps | { selectable?: false };

export function rowActionsEnabled(sel: SuperAdminRowSelection): boolean {
  return !sel.selectable || sel.selected;
}

export function rowActionClass(base: string, sel: SuperAdminRowSelection): string {
  return cn(base, sel.selectable && !sel.selected && "pointer-events-none opacity-40");
}

type SuperAdminRowLinkProps = LinkProps & {
  sel: SuperAdminRowSelection;
  className?: string;
  children: ReactNode;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
};

export function SuperAdminRowLink({ sel, className, children, onClick, ...linkProps }: SuperAdminRowLinkProps) {
  const base = className ?? ownerListActionClass;
  if (!rowActionsEnabled(sel)) {
    return (
      <span className={rowActionClass(base, sel)} aria-disabled>
        {children}
      </span>
    );
  }
  return (
    <Link
      {...linkProps}
      className={rowActionClass(base, sel)}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
    />
  );
}

type SuperAdminRowButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  sel: SuperAdminRowSelection;
  variant?: "default" | "danger";
};

export function SuperAdminRowButton({
  sel,
  variant = "default",
  className,
  disabled,
  onClick,
  ...props
}: SuperAdminRowButtonProps) {
  const base = className ?? (variant === "danger" ? ownerListActionDangerClass : ownerListActionClass);
  const locked = sel.selectable && !sel.selected;
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || locked}
      className={rowActionClass(base, sel)}
      onClick={(e) => {
        if (locked) return;
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
