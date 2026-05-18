import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Bulk action control in `PaginatedList` selection toolbar (owner portal). */
export function OwnerBulkToolbarButton({
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
