import type { DiscountType } from "@/constants/enums";

/** Mirrors `ProductItem.discounted_price` / purchase discount rules on the backend. */
export function discountedUnitPrice(price: number, discountType: DiscountType, discount: number): number {
  if (discountType === "percentage") {
    return Math.max(0, price - (price * discount) / 100);
  }
  return Math.max(0, price - discount);
}

/** Catalog (list) unit price when it is above the discounted unit price; used in cart and receipts. */
export function listCatalogUnitPrice(price: number, discountType: DiscountType, discount: number): number | undefined {
  const final = discountedUnitPrice(price, discountType, discount);
  if (!(price > final + 1e-6)) return undefined;
  return price;
}
