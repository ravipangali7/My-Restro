export interface OwnerNotification {
  id: string;
  restaurantId: number;
  title: string;
  message: string;
  to: string;
  createdAt: string;
  read: boolean;
}

const STORAGE_KEY = "myrestro.owner.notifications.v1";

type OwnerNotificationListener = () => void;
const ownerNotificationListeners = new Set<OwnerNotificationListener>();

/** Subscribe to local owner-notification storage changes (same-tab updates do not fire `storage` events). */
export function subscribeOwnerNotificationReads(listener: OwnerNotificationListener) {
  ownerNotificationListeners.add(listener);
  return () => {
    ownerNotificationListeners.delete(listener);
  };
}

function emitOwnerNotificationChange() {
  for (const fn of ownerNotificationListeners) fn();
}

function hasWindow() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readOwnerNotifications(restaurantId?: number | null): OwnerNotification[] {
  if (!hasWindow()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const rows = parsed.filter((x) => x && typeof x === "object") as OwnerNotification[];
    const filtered = restaurantId == null ? rows : rows.filter((n) => n.restaurantId === restaurantId);
    return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

function writeOwnerNotifications(rows: OwnerNotification[]) {
  if (!hasWindow()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  emitOwnerNotificationChange();
}

export function pushOwnerNotification(input: Omit<OwnerNotification, "id" | "createdAt" | "read">) {
  const rows = readOwnerNotifications();
  const next: OwnerNotification = {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    read: false,
  };
  writeOwnerNotifications([next, ...rows]);
}

export function markOwnerNotificationRead(notificationId: string) {
  const rows = readOwnerNotifications();
  const next = rows.map((row) => (row.id === notificationId ? { ...row, read: true } : row));
  writeOwnerNotifications(next);
}
