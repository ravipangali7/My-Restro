export const DiscountType = ["flat", "percentage"] as const;
export const PaymentStatus = ["pending", "success", "failed"] as const;
/** Matches Django `PaymentMethod` (`e_wallet`). */
export const PaymentMethod = ["cash", "e_wallet"] as const;
export const OrderType = ["table", "packing", "delivery"] as const;
export const OrderStatus = ["pending", "accepted", "running", "ready", "waiting_pickup", "delivered", "rejected"] as const;
export const TransactionType = ["in", "out"] as const;
export const TransactionCategory = [
  "transaction_fee", "order_payment", "subscription_fee", "sms_usage",
  "share_distribution", "share_withdrawal", "share_balance_adjustment", "due_paid",
  "ledger_credit", "ledger_debit", "salary"
] as const;
export const StockLogType = ["in", "out"] as const;
export const WithdrawalStatus = ["pending", "approved", "rejected"] as const;
export const BulkNotificationType = ["sms", "push"] as const;
export const UserRole = ["owner", "staff", "customer"] as const;
export const StaffRole = ["waiter", "cashier", "kitchen"] as const;
export const PartyType = ["customer", "staff", "supplier"] as const;
export const LedgerType = ["debit", "credit"] as const;

export type DiscountType = typeof DiscountType[number];
export type PaymentStatus = typeof PaymentStatus[number];
export type PaymentMethod = typeof PaymentMethod[number];
export type OrderType = typeof OrderType[number];
export type OrderStatus = typeof OrderStatus[number];
export type TransactionType = typeof TransactionType[number];
export type TransactionCategory = typeof TransactionCategory[number];
export type StockLogType = typeof StockLogType[number];
export type WithdrawalStatus = typeof WithdrawalStatus[number];
export type BulkNotificationType = typeof BulkNotificationType[number];
export type UserRole = typeof UserRole[number];
export type StaffRole = typeof StaffRole[number];
export type PartyType = typeof PartyType[number];
export type LedgerType = typeof LedgerType[number];
