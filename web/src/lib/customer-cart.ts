export type CustomerCartLine =
  | {
      kind: "product";
      restaurantId: number;
      productId: number;
      productItemId: number;
      name: string;
      unitLabel: string;
      unitPrice: number;
      /** Pre-discount catalog unit price when `unitPrice` is a menu offer price */
      listUnitPrice?: number;
      quantity: number;
      /** Resolved or API-relative image URL for checkout UI */
      imageUrl?: string | null;
    }
  | {
      kind: "combo";
      restaurantId: number;
      comboSetId: number;
      name: string;
      unitPrice: number;
      quantity: number;
      imageUrl?: string | null;
    };

export const CUSTOMER_CART_STORAGE_KEY = "myrestro.customer.cart.v1";

const cartListeners = new Set<() => void>();

export function subscribeCustomerCart(callback: () => void) {
  cartListeners.add(callback);
  return () => {
    cartListeners.delete(callback);
  };
}

function notifyCustomerCartChanged() {
  cartListeners.forEach((cb) => {
    cb();
  });
}

/** Sum of line quantities (items in cart), for badges and summaries. */
export function customerCartTotalQuantity(lines: CustomerCartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

function hasWindow() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function sanitizeLine(line: CustomerCartLine): CustomerCartLine {
  if (line.kind === "product") {
    const unitPrice = Number.isFinite(line.unitPrice) ? Math.max(0, line.unitPrice) : 0;
    let listUnitPrice = line.listUnitPrice;
    if (listUnitPrice != null) {
      listUnitPrice = Number.isFinite(listUnitPrice) ? Math.max(0, listUnitPrice) : undefined;
      if (listUnitPrice != null && listUnitPrice + 1e-6 < unitPrice) listUnitPrice = undefined;
      if (listUnitPrice != null && Math.abs(listUnitPrice - unitPrice) < 1e-6) listUnitPrice = undefined;
    }
    return {
      ...line,
      unitPrice,
      listUnitPrice,
      quantity: Number.isFinite(line.quantity) ? Math.max(1, Math.trunc(line.quantity)) : 1,
    };
  }
  return {
    ...line,
    unitPrice: Number.isFinite(line.unitPrice) ? Math.max(0, line.unitPrice) : 0,
    quantity: Number.isFinite(line.quantity) ? Math.max(1, Math.trunc(line.quantity)) : 1,
  } as CustomerCartLine;
}

export function readCustomerCart(): CustomerCartLine[] {
  if (!hasWindow()) return [];
  try {
    const raw = window.localStorage.getItem(CUSTOMER_CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => x as CustomerCartLine)
      .filter((x) => x && typeof x === "object" && typeof x.kind === "string")
      .map(sanitizeLine);
  } catch {
    return [];
  }
}

export function writeCustomerCart(lines: CustomerCartLine[]) {
  if (!hasWindow()) return;
  window.localStorage.setItem(CUSTOMER_CART_STORAGE_KEY, JSON.stringify(lines.map(sanitizeLine)));
  notifyCustomerCartChanged();
}

export function clearCustomerCart() {
  if (!hasWindow()) return;
  window.localStorage.removeItem(CUSTOMER_CART_STORAGE_KEY);
  notifyCustomerCartChanged();
}
