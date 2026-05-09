import type { PortalRole } from "@/lib/auth-context";

/** Canonical staff URLs — use these for navigation so redirects and guards stay aligned. */
export const STAFF_PATH = {
  home: "/staff",
  /** Cashier overview dashboard (distinct from `/staff` index used by waiter/kitchen). */
  cashierDashboard: "/staff/cashier",
  menuQr: "/staff/menu-qr",
  pos: "/staff/pos",
  paymentAlerts: "/staff/payment-alerts",
  liveorders: "/staff/liveorders",
  waitingPickup: "/staff/waiting-pickup",
  purchases: "/staff/purchases",
  expenses: "/staff/expenses",
  ledger: "/staff/ledger",
  transactions: "/staff/transactions",
  notifications: "/staff/notifications",
  profile: "/staff/profile",
} as const;

export type StaffPortalRole = "waiter" | "cashier" | "kitchen";

const STAFF_PORTAL_ROLES: StaffPortalRole[] = ["waiter", "cashier", "kitchen"];

function isStaffPortalRole(role: PortalRole): role is StaffPortalRole {
  return (STAFF_PORTAL_ROLES as PortalRole[]).includes(role);
}

/** Default home path after login / index redirect for each portal role. */
export const portalHomeByRole: Record<PortalRole, string> = {
  superadmin: "/superadmin",
  owner: "/dashboard",
  waiter: STAFF_PATH.home,
  cashier: STAFF_PATH.cashierDashboard,
  kitchen: STAFF_PATH.liveorders,
  customer: "/customer",
  shareholder: "/shareholder",
};

const PORTAL_PATH_PREFIXES: Record<PortalRole, readonly string[]> = {
  superadmin: ["/superadmin"],
  owner: ["/dashboard", "/owner"],
  waiter: ["/staff"],
  cashier: ["/staff"],
  kitchen: ["/staff"],
  customer: ["/customer"],
  shareholder: ["/shareholder"],
};

function stripQueryAndHash(href: string): string {
  return href.split("#")[0]?.split("?")[0] ?? "";
}

function normalizePathname(path: string): string {
  const p = stripQueryAndHash(path);
  if (p.length > 1 && p.endsWith("/")) return p.slice(0, -1);
  return p;
}

function pathMatchesPortalPrefixes(path: string, role: PortalRole): boolean {
  const prefixes = PORTAL_PATH_PREFIXES[role];
  return prefixes.some((pre) => path === pre || path.startsWith(`${pre}/`));
}

/** Same-origin style app paths only (prevents open redirects). */
export function isSafeInternalRedirect(href: string): boolean {
  const path = stripQueryAndHash(href);
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  if (path.includes("://")) return false;
  if (path.includes("\\")) return false;
  try {
    const decoded = decodeURIComponent(path);
    if (decoded.includes("..")) return false;
  } catch {
    return false;
  }
  return true;
}

/** Split pathname vs query/hash for validated in-app links (query + hash are kept when the path is allowed). */
function splitSafeInternalPath(href: string): { pathOnly: string; suffix: string } {
  const hashIdx = href.indexOf("#");
  const beforeHash = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
  const hashPart = hashIdx >= 0 ? href.slice(hashIdx) : "";
  const qIdx = beforeHash.indexOf("?");
  const pathOnlyRaw = qIdx >= 0 ? beforeHash.slice(0, qIdx) : beforeHash;
  const queryPart = qIdx >= 0 ? beforeHash.slice(qIdx) : "";
  let pathOnly = pathOnlyRaw;
  if (pathOnly.length > 1 && pathOnly.endsWith("/")) pathOnly = pathOnly.slice(0, -1);
  return { pathOnly, suffix: `${queryPart}${hashPart}` };
}

/** Resolve an in-app notification deep link for the signed-in portal, or fall back to that portal's home. */
export function safeBulkNotificationTargetLink(link: string | null | undefined, role: PortalRole | null): string {
  const home = role ? portalHomeByRole[role] ?? "/" : "/";
  if (!link || !link.trim()) return home;
  const trimmed = link.trim();
  if (!isSafeInternalRedirect(trimmed)) return home;
  if (!role) return home;
  const { pathOnly, suffix } = splitSafeInternalPath(trimmed);
  if (!pathMatchesPortalPrefixes(pathOnly, role)) return home;
  return `${pathOnly}${suffix}`;
}

/** Options for `useNavigate` from a validated bulk-notification `link` (pathname + optional hash/query). */
export function bulkNotificationNavigateTarget(link: string | null | undefined, role: PortalRole | null): {
  to: string;
  hash?: string;
} {
  const resolved = safeBulkNotificationTargetLink(link, role);
  const hashIdx = resolved.indexOf("#");
  const pathAndQuery = hashIdx >= 0 ? resolved.slice(0, hashIdx) : resolved;
  const hash = hashIdx >= 0 ? resolved.slice(hashIdx + 1) : undefined;
  return { to: pathAndQuery, ...(hash && /^[a-zA-Z0-9_.-]+$/.test(hash) ? { hash } : {}) };
}

/**
 * Whether an authenticated staff user may open this pathname (role-specific screens).
 */
export function isStaffPathAllowedForRole(role: StaffPortalRole, pathname: string): boolean {
  const path = normalizePathname(pathname);
  if (path === "/staff") return true;

  if (path === STAFF_PATH.pos) return role === "waiter";
  if (path === STAFF_PATH.cashierDashboard) return role === "cashier";
  if (path === STAFF_PATH.paymentAlerts) return role === "cashier";
  if (path === STAFF_PATH.notifications) return true;
  if (/^\/staff\/notifications\/[^/]+$/.test(path)) return true;
  if (path === STAFF_PATH.menuQr) return role === "waiter" || role === "cashier";
  if (path === STAFF_PATH.liveorders) {
    return role === "kitchen";
  }
  if (path === STAFF_PATH.waitingPickup) {
    return role === "waiter" || role === "kitchen";
  }

  if (path === STAFF_PATH.ledger || path === STAFF_PATH.profile) return true;
  if (/^\/staff\/ledger\/\d+$/.test(path)) return true;
  if (/^\/staff\/ledger\/(customer|staff|supplier)\/[^/]+$/.test(path)) return true;
  if (path === STAFF_PATH.transactions) return true;
  if (/^\/staff\/transactions\/[^/]+$/.test(path)) return true;

  return false;
}

/**
 * After login/register (or session restore), pick destination: optional deep link when safe, else role home.
 * `redirect` may include query string; only the pathname is validated — navigation uses pathname (TanStack `to`).
 */
export function resolvePostAuthDestination(role: PortalRole, redirect: string | undefined): string {
  const home = portalHomeByRole[role] ?? "/login";
  if (!redirect || !isSafeInternalRedirect(redirect)) return home;

  const pathOnly = normalizePathname(redirect);
  if (pathOnly === "/login" || pathOnly === "/register") return home;
  if (!pathMatchesPortalPrefixes(pathOnly, role)) return home;

  if (pathOnly.startsWith("/staff")) {
    if (!isStaffPortalRole(role)) return home;
    if (!isStaffPathAllowedForRole(role, pathOnly)) return home;
  }

  return pathOnly;
}
