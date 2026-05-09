/** Build a human-readable customer label from order API fields (list + detail). */
export function orderCustomerDisplay(o: {
  customer?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  guest_customer_name?: string | null;
  guest_customer_phone?: string | null;
}): string {
  const cn = (o.customer_name ?? "").trim();
  const cp = (o.customer_phone ?? "").trim();
  if (cn) {
    return cp ? `${cn} (${cp})` : cn;
  }
  if (o.customer != null) {
    return `User #${o.customer}`;
  }
  const gn = (o.guest_customer_name ?? "").trim();
  const gp = (o.guest_customer_phone ?? "").trim();
  const guestParts = [gn, gp].filter(Boolean);
  if (guestParts.length) {
    return guestParts.join(" · ");
  }
  return "Guest";
}
