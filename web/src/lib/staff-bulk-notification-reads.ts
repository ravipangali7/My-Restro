const STORAGE_KEY = "myrestro.staff-bulk-notifications.read.v1";

type ReadListener = () => void;
const readListeners = new Set<ReadListener>();

/** Subscribe to local read-state changes (same-tab updates do not fire `storage` events). */
export function subscribeStaffBulkNotificationReads(listener: ReadListener) {
  readListeners.add(listener);
  return () => {
    readListeners.delete(listener);
  };
}

function emitReadChange() {
  for (const fn of readListeners) fn();
}

function hasWindow() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

type ReadMap = Record<string, number[]>;

function loadMap(): ReadMap {
  if (!hasWindow()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as ReadMap;
  } catch {
    return {};
  }
}

function saveMap(map: ReadMap) {
  if (!hasWindow()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

function keyForUser(userId: number) {
  return String(userId);
}

export function isStaffBulkNotificationRead(userId: number, notificationId: number): boolean {
  const map = loadMap();
  const ids = map[keyForUser(userId)] ?? [];
  return ids.includes(notificationId);
}

export function markStaffBulkNotificationRead(userId: number, notificationId: number) {
  const map = loadMap();
  const k = keyForUser(userId);
  const prev = map[k] ?? [];
  if (prev.includes(notificationId)) return;
  map[k] = [notificationId, ...prev];
  saveMap(map);
  emitReadChange();
}
