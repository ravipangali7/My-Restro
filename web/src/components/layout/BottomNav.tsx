import { Link, useLocation } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { useMemo } from "react";
import { isNavPathActive } from "@/lib/nav-active";

interface NavTab {
  title: string;
  to: string;
  icon: LucideIcon;
  /** If greater than zero, shown as a pill on the icon (e.g. cart count). */
  badge?: number;
}

interface BottomNavProps {
  tabs: NavTab[];
  /** One tab (e.g. center Orders) stays visually elevated compared to the rest. */
  featuredTo?: string;
}

export function BottomNav({ tabs, featuredTo }: BottomNavProps) {
  const location = useLocation();
  const tabPaths = useMemo(() => tabs.map((t) => t.to), [tabs]);

  return (
    <nav
      className="lg:hidden fixed inset-x-0 bottom-0 z-50 flex min-h-15 max-w-full items-stretch overflow-x-hidden overflow-y-visible border-t border-border bg-card pb-[max(0.25rem,env(safe-area-inset-bottom))] pl-[max(0.25rem,env(safe-area-inset-left))] pr-[max(0.25rem,env(safe-area-inset-right))] pt-1 touch-manipulation"
      aria-label="Primary"
    >
      <div className="flex min-h-0 min-w-0 flex-1 items-end gap-0.5 pb-0.5 sm:gap-1">
        {tabs.map((tab) => {
          const isActive = isNavPathActive(location.pathname, tab.to, tabPaths);
          const isFeatured = featuredTo != null && tab.to === featuredTo;
          const tone =
            isActive ? "text-primary" : isFeatured ? "text-primary/90" : "text-text-muted";
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`flex min-h-0 min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-0.5 rounded-md px-0.5 py-1 transition-colors sm:px-1 ${tone} ${
                isFeatured
                  ? "relative z-[1] -translate-y-1 rounded-2xl border border-primary/25 bg-gradient-to-b from-primary/14 to-primary/5 py-2 shadow-md ring-1 ring-primary/20 sm:-translate-y-1.5"
                  : ""
              } ${
                isFeatured && isActive
                  ? "border-primary/45 ring-2 ring-primary/40 shadow-lg"
                  : ""
              }`}
            >
              <span className="relative inline-flex shrink-0">
                <tab.icon
                  className={`size-[18px] sm:size-5 ${isFeatured ? "sm:scale-105" : ""}`}
                  aria-hidden
                />
                {tab.badge != null && tab.badge > 0 ? (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground tabular-nums sm:-right-2 sm:-top-2 sm:text-[10px]">
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </span>
                ) : null}
              </span>
              <span
                className={`w-full truncate text-center text-[10px] leading-tight sm:text-xs ${
                  isFeatured ? "font-semibold" : "font-medium"
                }`}
              >
                {tab.title}
              </span>
              {isActive ? (
                <span className="h-1 w-1 shrink-0 rounded-full bg-primary" aria-hidden />
              ) : (
                <span className="h-1 w-1 shrink-0 opacity-0" aria-hidden />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
