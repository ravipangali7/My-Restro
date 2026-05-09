import { Link, useLocation } from "@tanstack/react-router";
import { type LucideIcon, X, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { collectNavPaths, isNavPathActive } from "@/lib/nav-active";

export interface NavItem {
  title: string;
  to: string;
  icon: LucideIcon;
  children?: NavItem[];
}

interface AppSidebarProps {
  items: NavItem[];
  brandTitle?: string;
  onLogout?: () => void;
}

export function AppSidebar({ items, brandTitle = "My Restro", onLogout }: AppSidebarProps) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (title: string) => {
    setOpenGroups(prev => ({ ...prev, [title]: !prev[title] }));
  };

  const allNavPaths = useMemo(() => collectNavPaths(items), [items]);
  const isActive = (to: string) => isNavPathActive(location.pathname, to, allNavPaths);

  const isGroupActive = (item: NavItem): boolean => {
    if (item.children) return item.children.some(c => isActive(c.to));
    return isActive(item.to);
  };

  return (
    <aside
      className={`hidden min-h-0 shrink-0 lg:flex flex-col border-r border-border bg-sidebar transition-all duration-200 ${collapsed ? "w-16" : "w-60"}`}
    >
      <div className="h-16 flex items-center gap-2 px-4 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-display font-bold text-sm shrink-0">MR</div>
        {!collapsed && <span className="font-display font-bold text-foreground text-md truncate">{brandTitle}</span>}
        <button onClick={() => setCollapsed(!collapsed)} className="ml-auto text-text-muted hover:text-foreground p-1">
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="flex-1 py-2 overflow-y-auto">
        {items.map((item) => {
          if (item.children) {
            const groupActive = isGroupActive(item);
            const isOpen = openGroups[item.title] ?? groupActive;
            return (
              <div key={item.title}>
                <button
                  onClick={() => toggleGroup(item.title)}
                  type="button"
                  className="w-full flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors text-sidebar-foreground hover:bg-muted"
                  style={{ width: "calc(100% - 1rem)" }}
                >
                  <item.icon size={18} className="shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="truncate flex-1 text-left">{item.title}</span>
                      <ChevronDown size={14} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </>
                  )}
                </button>
                {isOpen && !collapsed && (
                  <div className="ml-6 border-l border-border pl-2">
                    {item.children.map((child) => (
                      <Link
                        key={child.to}
                        to={child.to}
                        className={`flex items-center gap-2 px-3 py-2 mx-2 rounded-lg text-sm transition-colors ${
                          isActive(child.to) ? "bg-accent text-accent-foreground font-semibold" : "text-sidebar-foreground hover:bg-muted"
                        }`}
                      >
                        <child.icon size={14} className="shrink-0" />
                        <span className="truncate">{child.title}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors ${
                isActive(item.to)
                  ? "bg-accent text-accent-foreground font-semibold border-l-3 border-primary"
                  : "text-sidebar-foreground hover:bg-muted"
              }`}
            >
              <item.icon size={18} className="shrink-0" />
              {!collapsed && <span className="truncate">{item.title}</span>}
            </Link>
          );
        })}
      </nav>

      {onLogout && (
        <div className="p-3 border-t border-border">
          <button onClick={onLogout}
            className="flex items-center gap-2 text-sm text-text-secondary hover:text-destructive w-full px-2 py-2 rounded-lg hover:bg-error-bg transition-colors">
            <X size={18} />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      )}
    </aside>
  );
}
