import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  CreditCard,
  Home,
  ShoppingBag,
  ShoppingCart,
  Store,
  User,
} from "lucide-react";

export type CustomerNavLink = {
  title: string;
  to: string;
  icon: LucideIcon;
};

/** Primary routes shown in the customer bottom navigation. */
export const CUSTOMER_BOTTOM_NAV_ITEMS: CustomerNavLink[] = [
  { title: "Home", to: "/customer", icon: Home },
  { title: "Restaurant", to: "/customer/restaurants", icon: Store },
  { title: "Cart", to: "/customer/cart", icon: ShoppingCart },
  { title: "Orders", to: "/customer/orders", icon: ShoppingBag },
  { title: "Ledger", to: "/customer/ledger", icon: BookOpen },
  { title: "Profile", to: "/customer/profile", icon: User },
];

/** Quick links from the customer profile screen (shown together in the header menu). */
export const CUSTOMER_PROFILE_MENU_LINKS: CustomerNavLink[] = [
  { title: "Notifications", to: "/customer/notifications", icon: Bell },
  { title: "My Orders", to: "/customer/orders", icon: ShoppingBag },
  { title: "Transactions", to: "/customer/transactions", icon: CreditCard },
  { title: "Cart", to: "/customer/cart", icon: ShoppingCart },
];
