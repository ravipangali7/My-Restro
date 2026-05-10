import { Link, useLocation } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { useMemo } from "react";
import { isNavPathActive } from "@/lib/nav-active";

/** Filled document / order-sheet glyph (not Lucide strokes) for the center hub. */
function FeaturedHubGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.828a2 2 0 0 0-.586-1.414L15 2.586A2 2 0 0 0 13.172 2H6Zm1 2h6v4a1 1 0 0 0 1 1h4v11H7V4Zm8 .414L16.586 8H15V4.414ZM9 10.5a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2h-4a1 1 0 0 1-1-1Zm0 3a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2h-4a1 1 0 0 1-1-1Z"
      />
    </svg>
  );
}

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
  /**
   * `hub` — filled order-sheet glyph (customer Orders).
   * `tab` — the tab’s Lucide icon inside the circle (e.g. owner Staff).
   */
  featuredIcon?: "hub" | "tab";
}

export function BottomNav({ tabs, featuredTo, featuredIcon = "hub" }: BottomNavProps) {
  const location = useLocation();
  const tabPaths = useMemo(() => tabs.map((t) => t.to), [tabs]);

  return (
    <nav
      className="lg:hidden fixed inset-x-0 bottom-0 z-50 max-w-full overflow-visible border-t border-border bg-card pb-[max(0.375rem,env(safe-area-inset-bottom))] pl-[max(0.25rem,env(safe-area-inset-left))] pr-[max(0.25rem,env(safe-area-inset-right))] pt-2 touch-manipulation"
      aria-label="Primary"
    >
      <div className="flex min-h-0 min-w-0 flex-1 items-end justify-stretch gap-0 px-0.5 pb-1 sm:gap-0.5 sm:px-1">
        {tabs.map((tab) => {
          const isActive = isNavPathActive(location.pathname, tab.to, tabPaths);
          const isFeatured = featuredTo != null && tab.to === featuredTo;

          if (isFeatured) {
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className="group relative z-[2] flex min-h-0 min-w-0 flex-1 basis-0 flex-col items-center justify-end px-0.5 pb-0.5 pt-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-card rounded-xl"
                aria-current={isActive ? "page" : undefined}
              >
                <span
                  className={`relative mb-1.5 flex size-[3.25rem] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground ring-[5px] ring-card transition-[transform,box-shadow,opacity] duration-200 sm:size-14 ${
                    isActive
                      ? "shadow-[0_10px_34px_-6px_color-mix(in_oklab,var(--primary)_55%,transparent)]"
                      : "shadow-[0_8px_26px_-6px_color-mix(in_oklab,var(--primary)_42%,transparent)] opacity-[0.96] group-hover:opacity-100"
                  } group-active:scale-95`}
                >
                  {featuredIcon === "hub" ? (
                    <FeaturedHubGlyph className="size-[1.4rem] sm:size-[1.55rem]" />
                  ) : (
                    <tab.icon
                      className="size-[1.35rem] sm:size-6"
                      strokeWidth={isActive ? 2.35 : 2}
                      aria-hidden
                    />
                  )}
                  {tab.badge != null && tab.badge > 0 ? (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-card px-1 text-[9px] font-bold leading-none text-primary tabular-nums ring-2 ring-primary sm:text-[10px]">
                      {tab.badge > 99 ? "99+" : tab.badge}
                    </span>
                  ) : null}
                </span>
                <span
                  className={`w-full truncate text-center text-[10px] font-medium leading-tight sm:text-xs ${
                    isActive ? "text-primary" : "text-text-muted group-hover:text-foreground/80"
                  }`}
                >
                  {tab.title}
                </span>
                <span
                  className={`mt-0.5 h-1 w-1 shrink-0 rounded-full transition-colors ${
                    isActive ? "bg-primary" : "bg-transparent"
                  }`}
                  aria-hidden
                />
              </Link>
            );
          }

          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`flex min-h-0 min-w-0 flex-1 basis-0 flex-col items-center justify-end gap-0.5 rounded-xl px-0.5 py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-card sm:px-1 ${
                isActive ? "text-primary" : "text-text-muted hover:text-foreground/75"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="relative inline-flex shrink-0">
                <tab.icon className="size-[18px] sm:size-5" strokeWidth={isActive ? 2.25 : 2} aria-hidden />
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
