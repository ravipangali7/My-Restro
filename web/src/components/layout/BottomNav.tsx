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
}

export function BottomNav({ tabs }: BottomNavProps) {
  const location = useLocation();
  const tabPaths = useMemo(() => tabs.map((t) => t.to), [tabs]);

  return (
    <nav
      className="lg:hidden fixed inset-x-0 bottom-0 z-50 flex h-15 max-w-full items-stretch overflow-x-hidden border-t border-border bg-card pb-[env(safe-area-inset-bottom)] pl-[max(0.25rem,env(safe-area-inset-left))] pr-[max(0.25rem,env(safe-area-inset-right))] touch-manipulation"
      aria-label="Primary"
    >
      <div className="flex min-h-0 min-w-0 flex-1 items-stretch gap-0.5 sm:gap-1">
        {tabs.map((tab) => {
          const isActive = isNavPathActive(location.pathname, tab.to, tabPaths);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`flex min-h-0 min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-0.5 rounded-md px-0.5 py-1 transition-colors sm:px-1 ${
                isActive ? "text-primary" : "text-text-muted"
              }`}
            >
              <span className="relative inline-flex shrink-0">
                <tab.icon className="size-[18px] sm:size-5" aria-hidden />
                {tab.badge != null && tab.badge > 0 ? (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground tabular-nums sm:-right-2 sm:-top-2 sm:text-[10px]">
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </span>
                ) : null}
              </span>
              <span className="w-full truncate text-center text-[10px] font-medium leading-tight sm:text-xs">
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
