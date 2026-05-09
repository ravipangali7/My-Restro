import { useEffect, useState } from "react";
import {
  CUSTOMER_CART_STORAGE_KEY,
  customerCartTotalQuantity,
  readCustomerCart,
  subscribeCustomerCart,
} from "@/lib/customer-cart";

/** Total item quantity in the customer cart; updates when the cart changes in this tab or another. */
export function useCustomerCartBadgeCount() {
  const [count, setCount] = useState(() => customerCartTotalQuantity(readCustomerCart()));

  useEffect(() => {
    const sync = () => {
      setCount(customerCartTotalQuantity(readCustomerCart()));
    };
    sync();
    const unsub = subscribeCustomerCart(sync);
    const onStorage = (e: StorageEvent) => {
      if (e.key === CUSTOMER_CART_STORAGE_KEY) sync();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      unsub();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return count;
}
