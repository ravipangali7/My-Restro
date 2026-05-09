export function money(amount: string | number): string {
  const n = typeof amount === "string" ? Number.parseFloat(amount) : amount;
  if (Number.isNaN(n)) return "₹0";
  return `₹${n.toLocaleString()}`;
}
