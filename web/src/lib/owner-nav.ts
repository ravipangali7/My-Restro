import type { NavItem } from "@/components/layout/AppSidebar";
import {
  LayoutDashboard,
  ShoppingBag,
  UtensilsCrossed,
  LayoutGrid,
  Users,
  Package,
  ClipboardList,
  UserCircle,
  BookOpen,
  ArrowLeftRight,
  Receipt,
  BarChart2,
  Settings,
  Layers,
  Box,
  Truck,
  Ruler,
  ShoppingCart,
  Grid3X3,
  Bell,
  Store,
  Home,
  User,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const ownerSidebarItems: NavItem[] = [
  { title: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { title: "Restaurants", to: "/owner/restaurants", icon: Store },
  { title: "Orders", to: "/owner/orders", icon: ShoppingBag },
  { title: "Notifications", to: "/owner/notifications", icon: Bell },
  {
    title: "Menu",
    to: "/owner/menu",
    icon: UtensilsCrossed,
    children: [
      { title: "Categories", to: "/owner/categories", icon: Layers },
      { title: "Products", to: "/owner/products", icon: Grid3X3 },
      { title: "Combo Sets", to: "/owner/combos", icon: Box },
    ],
  },
  { title: "Tables", to: "/owner/tables", icon: LayoutGrid },
  { title: "Staff", to: "/owner/staff", icon: Users },
  {
    title: "Inventory",
    to: "/owner/inventory",
    icon: Package,
    children: [
      { title: "Unit", to: "/owner/units", icon: Ruler },
      { title: "Raw Materials", to: "/owner/rawmaterials", icon: Package },
      { title: "Suppliers", to: "/owner/suppliers", icon: Truck },
      { title: "Purchases", to: "/owner/purchases", icon: ShoppingCart },
    ],
  },
  { title: "Stock Log", to: "/owner/stocklog", icon: ClipboardList },
  { title: "Customers", to: "/owner/customers", icon: UserCircle },
  { title: "Ledger", to: "/owner/ledger", icon: BookOpen },
  { title: "Transactions", to: "/owner/transactions", icon: ArrowLeftRight },
  { title: "Expenses", to: "/owner/expenses", icon: Receipt },
  { title: "Reports", to: "/owner/reports", icon: BarChart2 },
  { title: "Settings", to: "/owner/settings", icon: Settings },
];

/** Mobile bottom bar (mirrors customer app: five tabs with center hub on Staff). */
export const ownerBottomTabs: { title: string; to: string; icon: LucideIcon }[] = [
  { title: "Home", to: "/dashboard", icon: Home },
  { title: "Restaurant", to: "/owner/restaurants", icon: Store },
  { title: "Staff", to: "/owner/staff", icon: Users },
  { title: "Ledger", to: "/owner/ledger", icon: BookOpen },
  { title: "Profile", to: "/owner/profile", icon: User },
];

/** Path of the elevated center tab in `BottomNav` (same pattern as customer Orders). */
export const ownerBottomNavFeaturedTo = "/owner/staff" as const;
