import { Link, useLocation } from "@tanstack/react-router";
import { ChevronDown, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { collectNavPaths, isNavPathActive } from "@/lib/nav-active";
import type { NavItem } from "./AppSidebar";

const MOBILE_NAV_ID = "dashboard-mobile-nav";

interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  brandTitle?: string;
  onLogout?: () => void;
}

export { MOBILE_NAV_ID };

export function MobileNavDrawer({ open, onClose, items, brandTitle = "My Restro", onLogout }: MobileNavDrawerProps) {
  const location = useLocation();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const allNavPaths = useMemo(() => collectNavPaths(items), [items]);
  const isActive = useCallback((to: string) => isNavPathActive(location.pathname, to, allNavPaths), [location.pathname, allNavPaths]);

  const isGroupActive = useCallback(
    (item: NavItem): boolean => {
      if (item.children) return item.children.some((c) => isActive(c.to));
      return isActive(item.to);
    },
    [isActive],
  );

  const toggleGroup = (title: string) => {
    setOpenGroups((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  useEffect(() => {
    onClose();
  }, [location.pathname, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => {
      if (mq.matches) {
        document.body.style.overflow = prev;
      } else {
        document.body.style.overflow = "hidden";
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="lg:hidden" aria-hidden={!open}>
      <div
        className={`fixed inset-0 z-[60] bg-black/40 transition-opacity duration-200 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden={!open}
        onClick={onClose}
      />
      <aside
        id={MOBILE_NAV_ID}
        className={`fixed top-0 left-0 bottom-0 z-[61] w-[min(18rem,88vw)] flex flex-col border-r border-border bg-sidebar shadow-lg transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full pointer-events-none"
        }`}
        aria-hidden={!open}
      >
        <div className="h-14 flex items-center gap-2 px-4 border-b border-border shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-display font-bold text-sm shrink-0">
            MR
          </div>
          <span className="font-display font-bold text-foreground text-md truncate flex-1 min-w-0">{brandTitle}</span>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-foreground p-1 rounded-lg shrink-0"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 py-2 overflow-y-auto" aria-label="Main">
          {items.map((item) => {
            if (item.children) {
              const groupActive = isGroupActive(item);
              const isOpen = openGroups[item.title] ?? groupActive;
              return (
                <div key={item.title}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(item.title)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors text-sidebar-foreground hover:bg-muted"
                    style={{ width: "calc(100% - 1rem)" }}
                  >
                    <item.icon size={18} className="shrink-0" />
                    <span className="truncate flex-1 text-left">{item.title}</span>
                    <ChevronDown size={14} className={`transition-transform shrink-0 ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isOpen ? (
                    <div className="ml-6 border-l border-border pl-2">
                      {item.children.map((child) => (
                        <Link
                          key={child.to}
                          to={child.to}
                          onClick={onClose}
                          className={`flex items-center gap-2 px-3 py-2 mx-2 rounded-lg text-sm transition-colors ${
                            isActive(child.to)
                              ? "bg-accent text-accent-foreground font-semibold"
                              : "text-sidebar-foreground hover:bg-muted"
                          }`}
                        >
                          <child.icon size={14} className="shrink-0" />
                          <span className="truncate">{child.title}</span>
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            }
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors ${
                  isActive(item.to)
                    ? "bg-accent text-accent-foreground font-semibold border-l-3 border-primary"
                    : "text-sidebar-foreground hover:bg-muted"
                }`}
              >
                <item.icon size={18} className="shrink-0" />
                <span className="truncate">{item.title}</span>
              </Link>
            );
          })}
        </nav>

        {onLogout ? (
          <div className="p-3 border-t border-border shrink-0">
            <button
              type="button"
              onClick={() => {
                onClose();
                void onLogout();
              }}
              className="flex items-center gap-2 text-sm text-text-secondary hover:text-destructive w-full px-2 py-2 rounded-lg hover:bg-error-bg transition-colors"
            >
              <X size={18} />
              <span>Logout</span>
            </button>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
