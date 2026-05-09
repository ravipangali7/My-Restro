import type { OrderStatus, PaymentStatus, PaymentMethod, OrderType, TransactionType, TransactionCategory, WithdrawalStatus, StaffRole, PartyType, LedgerType, DiscountType } from "./enums";

// ─── Users ────────────────────────────────────────
export const dummyUsers = [
  { id: "u1", phone: "+91 98765 43210", name: "Rahul Sharma", role: "owner" as const, is_shareholder: true, balance: 15000, due_balance: 2500, fcm_token: "fcm_abc123", image: "", share_percentage: 25 },
  { id: "u2", phone: "+91 98765 43211", name: "Priya Patel", role: "staff" as const, is_shareholder: false, balance: 3200, due_balance: 0, fcm_token: "fcm_def456", image: "", share_percentage: 0 },
  { id: "u3", phone: "+91 98765 43212", name: "Amit Singh", role: "customer" as const, is_shareholder: false, balance: 800, due_balance: 150, fcm_token: "fcm_ghi789", image: "", share_percentage: 0 },
  { id: "u4", phone: "+91 98765 43213", name: "Neha Gupta", role: "owner" as const, is_shareholder: true, balance: 22000, due_balance: 1000, fcm_token: "fcm_jkl012", image: "", share_percentage: 30 },
  { id: "u5", phone: "+91 98765 43214", name: "Vikram Das", role: "staff" as const, is_shareholder: false, balance: 1500, due_balance: 0, fcm_token: "fcm_mno345", image: "", share_percentage: 0 },
  { id: "u6", phone: "+91 98765 43215", name: "Sita Devi", role: "customer" as const, is_shareholder: true, balance: 5000, due_balance: 300, fcm_token: "fcm_pqr678", image: "", share_percentage: 15 },
];

// ─── Restaurants ──────────────────────────────────
export const dummyRestaurants = [
  { id: "r1", user: "u1", slug: "spice-garden", name: "Spice Garden", phone: "+91 11 2345 6789", logo: "", address: "123 MG Road, Mumbai", latitude: 19.076, longitude: 72.877, due_balance: 2500, subscription_start: "2024-01-01", subscription_end: "2025-01-01", is_open: true, per_transaction_fee: 2.5, can_delivery: true },
  { id: "r2", user: "u4", slug: "tandoor-nights", name: "Tandoor Nights", phone: "+91 11 9876 5432", logo: "", address: "456 Park Street, Kolkata", latitude: 22.572, longitude: 88.363, due_balance: 1000, subscription_start: "2024-03-15", subscription_end: "2025-03-15", is_open: true, per_transaction_fee: 2.0, can_delivery: false },
  { id: "r3", user: "u1", slug: "chai-junction", name: "Chai Junction", phone: "+91 80 5555 1234", logo: "", address: "789 Brigade Road, Bangalore", latitude: 12.971, longitude: 77.594, due_balance: 0, subscription_start: "2024-06-01", subscription_end: "2024-12-01", is_open: false, per_transaction_fee: 3.0, can_delivery: true },
];

// ─── Categories ───────────────────────────────────
export const dummyCategories = [
  { id: "c1", name: "Starters", image: "", restaurant: "r1", parent: null },
  { id: "c2", name: "Main Course", image: "", restaurant: "r1", parent: null },
  { id: "c3", name: "Beverages", image: "", restaurant: "r1", parent: null },
  { id: "c4", name: "Desserts", image: "", restaurant: "r1", parent: null },
  { id: "c5", name: "North Indian", image: "", restaurant: "r1", parent: "c2" },
];

// ─── Products ─────────────────────────────────────
export const dummyProducts = [
  { id: "p1", name: "Butter Chicken", restaurant: "r1", category: "c5", image: "", is_active: true, is_veg: false },
  { id: "p2", name: "Paneer Tikka", restaurant: "r1", category: "c1", image: "", is_active: true, is_veg: true },
  { id: "p3", name: "Dal Makhani", restaurant: "r1", category: "c5", image: "", is_active: true, is_veg: true },
  { id: "p4", name: "Chicken Biryani", restaurant: "r1", category: "c2", image: "", is_active: true, is_veg: false },
  { id: "p5", name: "Mango Lassi", restaurant: "r1", category: "c3", image: "", is_active: true, is_veg: true },
  { id: "p6", name: "Gulab Jamun", restaurant: "r1", category: "c4", image: "", is_active: false, is_veg: true },
];

// ─── Product Items ────────────────────────────────
export const dummyProductItems = [
  { id: "pi1", product: "p1", unit: "Full", price: 350, discount_type: "percentage" as DiscountType, discount: 10 },
  { id: "pi2", product: "p1", unit: "Half", price: 200, discount_type: "flat" as DiscountType, discount: 20 },
  { id: "pi3", product: "p2", unit: "Full", price: 280, discount_type: "percentage" as DiscountType, discount: 0 },
  { id: "pi4", product: "p3", unit: "Full", price: 220, discount_type: "flat" as DiscountType, discount: 0 },
  { id: "pi5", product: "p4", unit: "Full", price: 300, discount_type: "percentage" as DiscountType, discount: 5 },
  { id: "pi6", product: "p5", unit: "Glass", price: 80, discount_type: "flat" as DiscountType, discount: 0 },
];

// ─── Tables ───────────────────────────────────────
export const dummyTables = [
  { id: "t1", restaurant: "r1", name: "T-01", capacity: 4, floor: "Ground", near_by: "Near Entrance", notes: "", image: "", latitude: 0, longitude: 0 },
  { id: "t2", restaurant: "r1", name: "T-02", capacity: 6, floor: "Ground", near_by: "Window Side", notes: "Preferred for couples", image: "", latitude: 0, longitude: 0 },
  { id: "t3", restaurant: "r1", name: "T-03", capacity: 2, floor: "1st Floor", near_by: "Corner", notes: "", image: "", latitude: 0, longitude: 0 },
  { id: "t4", restaurant: "r1", name: "T-04", capacity: 8, floor: "1st Floor", near_by: "Balcony", notes: "Party table", image: "", latitude: 0, longitude: 0 },
];

// ─── Staff ────────────────────────────────────────
export const dummyStaff = [
  { id: "s1", restaurant: "r1", user: "u2", role: "waiter" as StaffRole, joined_at: "2023-06-15", salary: 18000, salary_per_day: 600, is_suspend: false },
  { id: "s2", restaurant: "r1", user: "u5", role: "cashier" as StaffRole, joined_at: "2023-09-01", salary: 20000, salary_per_day: 667, is_suspend: false },
  { id: "s3", restaurant: "r1", user: "u2", role: "kitchen" as StaffRole, joined_at: "2024-01-10", salary: 15000, salary_per_day: 500, is_suspend: true },
];

// ─── Suppliers ────────────────────────────────────
export const dummySuppliers = [
  { id: "sup1", name: "Fresh Farms", restaurant: "r1", phone: "+91 99887 76655", image: "" },
  { id: "sup2", name: "Metro Wholesale", restaurant: "r1", phone: "+91 99887 76656", image: "" },
];

// ─── Units ────────────────────────────────────────
export const dummyUnits = [
  { id: "un1", name: "Kilogram", symbol: "kg", restaurant: "r1" },
  { id: "un2", name: "Litre", symbol: "L", restaurant: "r1" },
  { id: "un3", name: "Piece", symbol: "pc", restaurant: "r1" },
];

// ─── Raw Materials ────────────────────────────────
export const dummyRawMaterials = [
  { id: "rm1", name: "Chicken", restaurant: "r1", supplier: "sup1", unit: "un1", price: 250, stock: 15, min_stock: 5 },
  { id: "rm2", name: "Paneer", restaurant: "r1", supplier: "sup1", unit: "un1", price: 320, stock: 3, min_stock: 5 },
  { id: "rm3", name: "Cooking Oil", restaurant: "r1", supplier: "sup2", unit: "un2", price: 180, stock: 20, min_stock: 10 },
  { id: "rm4", name: "Flour", restaurant: "r1", supplier: "sup2", unit: "un1", price: 45, stock: 50, min_stock: 20 },
];

// ─── Orders ───────────────────────────────────────
export const dummyOrders = [
  { id: "o1", customer: "u3", restaurant: "r1", table: "t1", order_id: "ORD-001", order_type: "table" as OrderType, address: "", latitude: 0, longitude: 0, status: "pending" as OrderStatus, payment_status: "pending" as PaymentStatus, payment_method: "cash" as PaymentMethod, fcm_token: "", waiter: "u2", people_for: 3, sub_total: 830, discount: 50, total: 780, reject_reason: "" },
  { id: "o2", customer: "u6", restaurant: "r1", table: "t2", order_id: "ORD-002", order_type: "table" as OrderType, address: "", latitude: 0, longitude: 0, status: "accepted" as OrderStatus, payment_status: "pending" as PaymentStatus, payment_method: "e_wallet" as PaymentMethod, fcm_token: "", waiter: "u2", people_for: 2, sub_total: 560, discount: 0, total: 560, reject_reason: "" },
  { id: "o3", customer: null, restaurant: "r1", table: null, order_id: "ORD-003", order_type: "packing" as OrderType, address: "", latitude: 0, longitude: 0, status: "running" as OrderStatus, payment_status: "success" as PaymentStatus, payment_method: "cash" as PaymentMethod, fcm_token: "", waiter: "u2", people_for: 1, sub_total: 300, discount: 15, total: 285, reject_reason: "" },
  { id: "o4", customer: "u3", restaurant: "r1", table: null, order_id: "ORD-004", order_type: "delivery" as OrderType, address: "789 Linking Road, Mumbai", latitude: 19.068, longitude: 72.836, status: "ready" as OrderStatus, payment_status: "success" as PaymentStatus, payment_method: "e_wallet" as PaymentMethod, fcm_token: "", waiter: "u5", people_for: 1, sub_total: 650, discount: 30, total: 620, reject_reason: "" },
  { id: "o5", customer: "u6", restaurant: "r1", table: "t3", order_id: "ORD-005", order_type: "table" as OrderType, address: "", latitude: 0, longitude: 0, status: "rejected" as OrderStatus, payment_status: "failed" as PaymentStatus, payment_method: "cash" as PaymentMethod, fcm_token: "", waiter: "u2", people_for: 4, sub_total: 1200, discount: 0, total: 1200, reject_reason: "Kitchen closed" },
];

// ─── Order Items ──────────────────────────────────
export const dummyOrderItems = [
  { id: "oi1", order: "o1", product: "p1", productitem: "pi1", comboset: null, price: 350, quantity: 2, total: 700 },
  { id: "oi2", order: "o1", product: "p5", productitem: "pi6", comboset: null, price: 80, quantity: 1, total: 80 },
  { id: "oi3", order: "o2", product: "p2", productitem: "pi3", comboset: null, price: 280, quantity: 2, total: 560 },
  { id: "oi4", order: "o3", product: "p4", productitem: "pi5", comboset: null, price: 300, quantity: 1, total: 300 },
  { id: "oi5", order: "o4", product: "p1", productitem: "pi1", comboset: null, price: 350, quantity: 1, total: 350 },
  { id: "oi6", order: "o4", product: "p3", productitem: "pi4", comboset: null, price: 220, quantity: 1, total: 220 },
];

// ─── Transactions ─────────────────────────────────
export const dummyTransactions = [
  { id: "tr1", restaurant: "r1", amount: 780, payment_status: "success" as PaymentStatus, remarks: "Order ORD-001", transaction_type: "in" as TransactionType, category: "transaction_fee" as TransactionCategory, ledger: null, is_system: false },
  { id: "tr2", restaurant: "r1", amount: 5000, payment_status: "success" as PaymentStatus, remarks: "Monthly subscription", transaction_type: "out" as TransactionType, category: "subscription_fee" as TransactionCategory, ledger: null, is_system: true },
  { id: "tr3", restaurant: "r1", amount: 620, payment_status: "success" as PaymentStatus, remarks: "Order ORD-004", transaction_type: "in" as TransactionType, category: "transaction_fee" as TransactionCategory, ledger: null, is_system: false },
  { id: "tr4", restaurant: "r1", amount: 2000, payment_status: "pending" as PaymentStatus, remarks: "Share distribution Q1", transaction_type: "out" as TransactionType, category: "share_distribution" as TransactionCategory, ledger: null, is_system: true },
];

// ─── Expenses ─────────────────────────────────────
export const dummyExpenses = [
  { id: "e1", restaurant: "r1", expense_id: "EXP-001", particular: "Kitchen gas refill", amount: 1200 },
  { id: "e2", restaurant: "r1", expense_id: "EXP-002", particular: "Plumbing repair", amount: 800 },
  { id: "e3", restaurant: "r1", expense_id: "EXP-003", particular: "Electricity bill", amount: 4500 },
];

// ─── Ledger ───────────────────────────────────────
export const dummyLedger = [
  { id: "l1", restaurant: "r1", party_type: "customer" as PartyType, party_id: "u3", particular: "Order payment", amount: 780, type: "credit" as LedgerType },
  { id: "l2", restaurant: "r1", party_type: "supplier" as PartyType, party_id: "sup1", particular: "Purchase payment", amount: 5000, type: "debit" as LedgerType },
  { id: "l3", restaurant: "r1", party_type: "staff" as PartyType, party_id: "u2", particular: "Salary advance", amount: 3000, type: "debit" as LedgerType },
];

// ─── Super Settings ───────────────────────────────
export const dummySuperSettings = {
  subscription_fee_per_month: 5000,
  per_transaction_fee: 2.5,
  due_threshold: 10000,
  sms_per_usage: 0.5,
  balance: 125000,
};

// ─── Shareholder Withdrawals ──────────────────────
export const dummyWithdrawals = [
  { id: "w1", user: "u1", amount: 5000, status: "pending" as WithdrawalStatus, reject_reason: "", remarks: "Q1 profit withdrawal" },
  { id: "w2", user: "u6", amount: 3000, status: "approved" as WithdrawalStatus, reject_reason: "", remarks: "Monthly withdrawal" },
  { id: "w3", user: "u4", amount: 8000, status: "rejected" as WithdrawalStatus, reject_reason: "Insufficient platform balance", remarks: "Annual withdrawal" },
];

// ─── Purchases ────────────────────────────────────
export const dummyPurchases = [
  { id: "pu1", restaurant: "r1", supplier: "sup1", purchase_id: "PUR-001", subtotal: 8500, discount_type: "percentage" as DiscountType, discount: 5, total: 8075 },
  { id: "pu2", restaurant: "r1", supplier: "sup2", purchase_id: "PUR-002", subtotal: 4200, discount_type: "flat" as DiscountType, discount: 200, total: 4000 },
];

// ─── Combo Sets ───────────────────────────────────
export const dummyComboSets = [
  { id: "cs1", restaurant: "r1", name: "Family Feast", image: "", description: "Butter Chicken + Naan + Dal + Lassi", products: ["p1", "p3", "p5"], price: 599 },
  { id: "cs2", restaurant: "r1", name: "Veg Delight", image: "", description: "Paneer Tikka + Dal Makhani + Lassi", products: ["p2", "p3", "p5"], price: 499 },
];

// ─── Stock Logs ───────────────────────────────────
export const dummyStockLogs = [
  { id: "sl1", restaurant: "r1", raw_material: "rm1", type: "in" as const, quantity: 20, purchase: "pu1", purchase_item: "pui1", order: null, order_item: null, created_at: "2024-10-01" },
  { id: "sl2", restaurant: "r1", raw_material: "rm1", type: "out" as const, quantity: 5, purchase: null, purchase_item: null, order: "o1", order_item: "oi1", created_at: "2024-10-02" },
  { id: "sl3", restaurant: "r1", raw_material: "rm3", type: "in" as const, quantity: 30, purchase: "pu2", purchase_item: "pui3", order: null, order_item: null, created_at: "2024-10-01" },
  { id: "sl4", restaurant: "r1", raw_material: "rm2", type: "out" as const, quantity: 2, purchase: null, purchase_item: null, order: "o2", order_item: "oi3", created_at: "2024-10-03" },
  { id: "sl5", restaurant: "r1", raw_material: "rm4", type: "in" as const, quantity: 50, purchase: "pu2", purchase_item: "pui4", order: null, order_item: null, created_at: "2024-10-04" },
];

// ─── Purchase Items ──────────────────────────────
export const dummyPurchaseItems = [
  { id: "pui1", raw_material: "rm1", purchase: "pu1", price: 250, quantity: 20, total: 5000 },
  { id: "pui2", raw_material: "rm2", purchase: "pu1", price: 320, quantity: 10, total: 3200 },
  { id: "pui3", raw_material: "rm3", purchase: "pu2", price: 180, quantity: 10, total: 1800 },
  { id: "pui4", raw_material: "rm4", purchase: "pu2", price: 45, quantity: 50, total: 2250 },
];

// ─── Product Raw Materials ───────────────────────
export const dummyProductRawMaterials = [
  { id: "prm1", restaurant: "r1", product: "p1", product_item: "pi1", raw_material: "rm1", raw_material_quantity: 0.5 },
  { id: "prm2", restaurant: "r1", product: "p1", product_item: "pi1", raw_material: "rm3", raw_material_quantity: 0.1 },
  { id: "prm3", restaurant: "r1", product: "p2", product_item: "pi3", raw_material: "rm2", raw_material_quantity: 0.3 },
  { id: "prm4", restaurant: "r1", product: "p3", product_item: "pi4", raw_material: "rm4", raw_material_quantity: 0.2 },
];

// ─── Bulk Notifications ─────────────────────────
export const dummyBulkNotifications = [
  { id: "bn1", restaurant: "r1", message: "Happy Diwali! Get 20% off on all orders today!", receivers: ["u3", "u6"], image: "", type: "sms" as const },
  { id: "bn2", restaurant: "r1", message: "New menu items added! Check out our specials.", receivers: ["u3", "u6"], image: "", type: "push" as const },
];
