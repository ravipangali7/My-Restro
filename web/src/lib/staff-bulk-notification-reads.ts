const STORAGE_KEY = "myrestro.staff-bulk-notifications.read.v1";

type ReadListener = () => void;
const readListeners = new Set<ReadListener>();

function normalizeNotificationId(notificationId: number): number | null {
  const n = Number(notificationId);
  return Number.isFinite(n) ? n : null;
}

/** Coerce stored JSON values (numbers or numeric strings) to a deduped number list. */
function normalizeStoredIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const x of raw) {
    const n = Number(x);
    if (!Number.isFinite(n) || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

let storageListenerAttached = false;
function ensureCrossTabReadSync() {
  if (!hasWindow() || storageListenerAttached) return;
  storageListenerAttached = true;
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    emitReadChange();
  });
}

/** Subscribe to local read-state changes (same-tab via emit; other tabs via `storage`). */
export function subscribeStaffBulkNotificationReads(listener: ReadListener) {
  ensureCrossTabReadSync();
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
    const rawMap = parsed as Record<string, unknown>;
    const map: ReadMap = {};
    for (const k of Object.keys(rawMap)) {
      const v = rawMap[k];
      map[k] = Array.isArray(v) ? normalizeStoredIds(v) : [];
    }
    return map;
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
  const nid = normalizeNotificationId(notificationId);
  if (nid == null) return false;
  const map = loadMap();
  const ids = map[keyForUser(userId)] ?? [];
  return ids.includes(nid);
}

export function markStaffBulkNotificationRead(userId: number, notificationId: number) {
  const nid = normalizeNotificationId(notificationId);
  if (nid == null) return;
  const map = loadMap();
  const k = keyForUser(userId);
  const prev = map[k] ?? [];
  if (prev.includes(nid)) return;
  map[k] = [nid, ...prev];
  saveMap(map);
  emitReadChange();
}
