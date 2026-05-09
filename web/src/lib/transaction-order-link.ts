/**
 * Matches order-linked transaction remarks:
 * - `Transaction fee — order <public_order_id>` (platform fee)
 * - `Order payment — <public_order_id>` (order sale / payment mirror)
 * - `Order <public_order_id>` (legacy / demo)
 */
export function parseOrderPublicIdFromTransactionRemarks(remarks: string | undefined | null): string | null {
  if (!remarks) return null;
  let m = remarks.match(/Transaction fee\s*[—-]\s*order\s+(\S+)/i);
  if (m?.[1]) return m[1].trim() || null;
  m = remarks.match(/Order\s+payment\s*[—-]\s*(\S+)/i);
  if (m?.[1]) return m[1].trim() || null;
  m = remarks.match(/^Order\s+(\S+)\s*$/i);
  if (m?.[1]) return m[1].trim() || null;
  return null;
}

export type OrderLinkFields = {
  id: number;
  order_id: string;
  payment_status: string;
  payment_method?: string;
  status?: string;
  total?: string | number;
  created_at?: string;
};

type TxLinkFields = {
  remarks?: string | null;
  payment_status: string;
  transaction_type?: string;
};

const LINKABLE_PAYMENT = new Set(["success", "pending"]);

function isLinkablePaymentStatus(value: string | undefined | null): boolean {
  return LINKABLE_PAYMENT.has(String(value ?? "").toLowerCase());
}

/**
 * When transaction remarks reference a placed order and both the transaction
 * and the order are in a linkable payment state (success or pending), return
 * that order for display (including amount on the caller side).
 */
export function resolvePaidOrderForTransaction(tx: TxLinkFields, orders: OrderLinkFields[] | undefined): OrderLinkFields | null {
  const pub = parseOrderPublicIdFromTransactionRemarks(tx.remarks ?? undefined);
  if (!pub || !orders?.length) return null;
  if (!isLinkablePaymentStatus(tx.payment_status)) return null;
  const order = orders.find((o) => o.order_id === pub);
  if (!order || !isLinkablePaymentStatus(order.payment_status)) return null;
  return order;
}
