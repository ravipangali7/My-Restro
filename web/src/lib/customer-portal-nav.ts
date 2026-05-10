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

/** Primary routes shown in the customer bottom navigation (cart lives in the header). */
export const CUSTOMER_BOTTOM_NAV_ITEMS: CustomerNavLink[] = [
  { title: "Home", to: "/customer", icon: Home },
  { title: "Restaurant", to: "/customer/restaurants", icon: Store },
  { title: "Orders", to: "/customer/orders", icon: ShoppingBag },
  { title: "Ledger", to: "/customer/ledger", icon: BookOpen },
  { title: "Profile", to: "/customer/profile", icon: User },
];

const cartLink: CustomerNavLink = { title: "Cart", to: "/customer/cart", icon: ShoppingCart };

const [drawerHome, drawerRestaurant, ...drawerAfterRestaurant] = CUSTOMER_BOTTOM_NAV_ITEMS;

/** Full primary links for the slide-out menu (includes cart between Restaurant and Orders). */
export const CUSTOMER_DRAWER_NAV_ITEMS: CustomerNavLink[] = [
  drawerHome,
  drawerRestaurant,
  cartLink,
  ...drawerAfterRestaurant,
];

/** Quick links from the customer profile screen (shown together in the header menu). */
export const CUSTOMER_PROFILE_MENU_LINKS: CustomerNavLink[] = [
  { title: "Notifications", to: "/customer/notifications", icon: Bell },
  { title: "My Orders", to: "/customer/orders", icon: ShoppingBag },
  { title: "Transactions", to: "/customer/transactions", icon: CreditCard },
  { title: "Cart", to: "/customer/cart", icon: ShoppingCart },
];
