# Dynamic frontend blueprint — MyRestro

This document is the **implementation guide** for replacing static `web/src/constants/dummy-data.ts` usage with **live API data** aligned with `server/core/models.py`, the domain notes in `models_logic.md`, and the overview in `models.md`. It does **not** change code by itself; it tells you what to wire where so every page, form, table, and card becomes data-driven.

**Authoritative sources**

| Document | Role |
| -------- | ---- |
| `server/core/models.py` | Field names, relations, enum values (`TextChoices`). |
| `models.md` | Portal split, enum list, model field checklist. |
| `models_logic.md` | Business rules, frontend vs backend gaps, withdrawal enum note (`rejected` not `reject`). |

**Backend reality check (this repo)**

- **REST API** is mounted at `api/` (see `server/myrestro/urls.py` → `core.urls`). Implemented viewsets today: `OrderViewSet`, `PurchaseViewSet`, `ShareholderWithdrawalViewSet` (`server/core/api/views.py`). Many screens still need **new** list/detail/create endpoints or admin-only flows.
- **Service layer** exists under `server/core/services/` (`orders`, `purchases`, `inventory`, `withdrawals`, `transactions`, `pricing`, …). Order creation and status transitions use these services from the API where exposed.
- **`models_logic.md` §1** is partially outdated: there are now API routes and services, not “empty views only.” Keep using it for **design intent** (stock, ledger, fees) where the API is not built yet.

---

## 1. Naming and payload contract

### 1.1 JSON shape

- Django REST Framework serializers use **snake_case** (`order_id`, `product_item`, `is_active`, `due_balance`). The React app’s dummy objects use **snake_case** in many places already; keep **one** convention in TypeScript types (either snake_case to match API, or camelCase in UI with a thin mapper layer).
- Primary keys from the API are **integers** (`id`), not string placeholders like `"o1"`. Update route params (`/owner/orders/$id`) to numeric ids once wired.

### 1.2 Enums (`web/src/constants/enums.ts` ↔ `models.py`)

Keep frontend arrays **identical** to Django values:

| Frontend export | Backend `TextChoices` | Notes |
| --------------- | ---------------------- | ----- |
| `PaymentMethod` includes `e_wallet` | `PaymentMethod.E_WALLET` | Same string `e_wallet`. |
| `WithdrawalStatus` | `pending`, `approved`, `rejected` | Align `models.md` typo “reject” → **`rejected`**. |
| `TransactionCategory` | `TransactionCategory` | Values like `sms_usage`, `share_withdrawal` (underscores). |
| `UserRole` in UI | `UserRole` in Django | Django adds `super_admin`; expose only in super-admin UI. |

### 1.3 Images and media

- Models use `ImageField` (`upload_to=...`). API should return **absolute or media-relative URLs**; the web app should render `<img src={…}>` from the server base URL (configure `VITE_*` or env for API + media origin).

### 1.4 Auth (today vs target)

- **Current:** `web/src/lib/auth-context.tsx` stores `{ phone, role, userName }` in `localStorage` after a fake OTP on `login.tsx`. No JWT/session.
- **Target:** Login via OTP (`Otp` model), issue token (session cookie or `Authorization: Bearer`), attach user id and `User.role`; gate layouts (`owner.tsx`, `staff.tsx`, …) by **server-verified** role. Map Django `UserRole` + `Staff` membership to portal routes (owner vs staff waiter/cashier/kitchen).

---

## 2. Implemented API surface (use first for “dynamic” work)

Base path prefix: **`/api/`** (relative to server origin).

| Method / action | Path | Purpose | Models / services |
| --------------- | ---- | ------- | ----------------- |
| `GET`, `POST` | `/api/orders/` | List / create orders | `Order`, `OrderItem`; `create_order_with_items` |
| `POST` | `/api/orders/{id}/transition-status/` | Status change (e.g. → `ready`) | `transition_order_status`, optional stock via `consume_inventory_when_ready` |
| `GET` | `/api/purchases/` | List purchases | `Purchase` |
| `POST` | `/api/purchases/{id}/finalize/` | Post purchase / stock in | `finalize_purchase` |
| `GET`, `POST` | `/api/shareholder-withdrawals/` | List / request withdrawal | `ShareholderWithdrawal`; `request_shareholder_withdrawal` |
| `POST` | `/api/shareholder-withdrawals/{id}/approve/` | Approve | `approve_shareholder_withdrawal` |
| `POST` | `/api/shareholder-withdrawals/{id}/reject/` | Reject (body: `reason`) | `reject_shareholder_withdrawal` |

**Create order body (illustrative)** — see `OrderCreateSerializer` in `server/core/api/serializers.py`:

- `restaurant` (PK), `lines[]` with exactly one of `product_item_id` or `comboset_id` per line, `quantity`.
- Optional: `customer`, `table`, `order_type`, `address`, `latitude`, `longitude`, `payment_method`, `fcm_token`, `waiter`, `people_for`, `order_discount`.

**Staff POS “Place Order”** (`staff.pos.tsx`): replace local cart with `POST /api/orders/` using integer `product_item_id` (and/or `comboset_id`) and current restaurant/table/waiter context from auth + selected UI state.

---

## 3. Backend features not yet exposed as REST (needed for full dynamism)

Expose or consume these via **new** viewsets/serializers when you implement them (all backed by existing models/services or straightforward CRUD):

- **Catalog:** `Category`, `Product`, `ProductItem`, `Unit`, `ComboSet`, `ProductRawMaterial` — list/create/update for owner; read for staff POS.
- **Floor:** `Table` — CRUD; staff POS table picker.
- **Inventory:** `RawMaterial`, `Purchase` create (lines), `StockLog` list/detail — owner/staff read paths.
- **People:** `Supplier`, `Staff`, `User` (customers) — owner; super-admin users/restaurants.
- **Money:** `Expense`, `Ledger`, `Transaction`, `Restaurant` billing fields, `SuperSetting`.
- **Comms:** `BulkNotification`.
- **Auth:** OTP send/verify, token refresh, `User` profile with `image`, `fcm_token`.

---

## 4. Shared UI layer (how to make it “100% dynamic”)

| Piece | Location | Dynamic behavior |
| ----- | -------- | ---------------- |
| Tables | `components/shared/DataTable.tsx` | Already generic: pass `columns` and `data` from **fetch** / React Query. Replace `dummy*` arrays with API response arrays; keep `id` stable. |
| Status chips | `components/shared/StatusBadge.tsx` | Drive `status` from row fields; ensure enum strings match API. |
| Forms | `components/ui/*`, `form.tsx` | Bind `react-hook-form` (or similar) to POST/PATCH bodies matching serializers; show field errors from `400` responses. |
| Cards / lists | Route files | Same: map `data.map(...)` over API list; empty states when `length === 0`. |
| Pricing display | `lib/pricing.ts` | Keep for **client preview** only; trust **server** `sub_total` / `total` / line totals on persisted orders. |

---

## 5. Route-by-route: dummy source → API / model target

Below, **dummy** = `web/src/constants/dummy-data.ts` (and hardcoded lists in the file). **Target** = what to load or mutate in production.

### 5.1 Global

| File | Current | Dynamic target |
| ---- | ------- | --------------- |
| `routes/__root.tsx` | Static meta | Optional: CMS or env-driven site name; unchanged for data. |
| `routes/index.tsx` | Auth redirect | Same after real auth. |
| `routes/login.tsx` | `dummyAccounts`, OTP `123456` | OTP API (`Otp`), verify, store token + user; map `User.role` and staff profile to `PortalRole`. |

### 5.2 Super admin (`superadmin.*`)

| Route file | Dummy / notes | Models / API |
| ---------- | ------------- | ------------ |
| `superadmin.index.tsx` | Aggregates from dummy | `Transaction`, `Restaurant`, `ShareholderWithdrawal` summaries — needs reporting endpoints. |
| `superadmin.settings.tsx` | `dummySuperSettings` | `SuperSetting` singleton — GET/PATCH. |
| `superadmin.users.tsx`, `superadmin.users_.$id.tsx` | `dummyUsers` | `User` — list/filter by role; detail update. |
| `superadmin.restaurants.tsx`, `superadmin.restaurants_.$id.tsx` | `dummyRestaurants` | `Restaurant` — list/detail; include `user` (owner). |
| `superadmin.shareholders.tsx`, `superadmin.shareholders_.$id.tsx` | Users with `is_shareholder` | `User` filter `is_shareholder=True`. |
| `superadmin.transactions.tsx`, `superadmin.transactions_.$id.tsx` | `dummyTransactions` | `Transaction` — list/detail. |
| `superadmin.withdrawals.tsx`, `superadmin.withdrawals_.$id.tsx` | `dummyWithdrawals` | `GET/POST /api/shareholder-withdrawals/`, `approve`, `reject` — **already partially wired**. |
| `superadmin.notifications.tsx`, `superadmin.notifications_.$id.tsx` | `dummyBulkNotifications` | `BulkNotification` — CRUD + file upload for `image`. |
| `superadmin.profile.tsx` | Local | Authenticated `User` (super_admin). |

### 5.3 Owner (`owner.*`)

| Route file | Dummy / notes | Models / API |
| ---------- | ------------- | ------------ |
| `owner.index.tsx` | Dummy KPIs | Aggregate orders/transactions/expenses — custom dashboard API or client-side from list endpoints. |
| `owner.settings.tsx` | Restaurant slice | `Restaurant` for logged-in owner — GET/PATCH (`is_open`, `can_delivery`, fees, etc.). |
| `owner.profile.tsx` | Auth | `User` PATCH. |
| `owner.categories.tsx` | `dummyCategories` | `Category` — tree optional (`parent`). |
| `owner.units.tsx` | `dummyUnits` | `Unit`. |
| `owner.suppliers.tsx` | `dummySuppliers` | `Supplier`. |
| `owner.products.tsx`, `owner.products_.$id.tsx` | `dummyProducts`, items, PRM | `Product`, `ProductItem`, `ProductRawMaterial`; `ProductItem` uses FK `unit` (dummy used string label — replace with `unit` id + `symbol`). |
| `owner.combos.tsx`, `owner.combos_.$id.tsx` | `dummyComboSets` | `ComboSet` + M2M `products`. |
| `owner.tables.tsx`, `owner.tables_.$id.tsx` | `dummyTables` | `Table`. |
| `owner.staff.tsx`, `owner.staff_.$id.tsx` | `dummyStaff` | `Staff` + `User`. |
| `owner.customers.tsx`, `owner.customers_.$id.tsx` | `dummyUsers` (customers) | `User` role `customer` + orders. |
| `owner.orders.tsx`, `owner.orders_.$id.tsx` | `dummyOrders`, `dummyOrderItems` | `GET /api/orders/`, detail; status changes `transition-status`; show nested `items`. |
| `owner.purchases.tsx`, `owner.purchases_.$id.tsx` | `dummyPurchases`, `dummyPurchaseItems` | `Purchase` list/detail; `POST finalize` when business allows. |
| `owner.rawmaterials.tsx`, `owner.rawmaterials_.$id.tsx` | `dummyRawMaterials` | `RawMaterial`. |
| `owner.stocklog.tsx`, `owner.stocklog_.$id.tsx` | `dummyStockLogs` | `StockLog` list/detail; link display to purchase/order. |
| `owner.expenses.tsx`, `owner.expenses_.$id.tsx` | `dummyExpenses` | `Expense`. |
| `owner.transactions.tsx`, `owner.transactions_.$id.tsx` | `dummyTransactions` | `Transaction`. |
| `owner.ledger.tsx`, `owner.ledger_.$partyType.$partyId.tsx` | `dummyLedger` | `Ledger` filtered by `restaurant`, `party_type`, `party_id` (string per model). |
| `owner.reports.tsx` | Dummy | Reports from aggregated queries — define API or export from list endpoints. |

### 5.4 Staff (`staff.*`)

| Route file | Dummy / notes | Models / API |
| ---------- | ------------- | ------------ |
| `staff.index.tsx` | Dummy | Role-specific home; orders summary. |
| `staff.pos.tsx` | `dummyProducts`, `dummyProductItems`, `dummyCategories`, `dummyTables` | Catalog + tables from API; **`POST /api/orders/`** for place order. |
| `staff.lineorders.tsx` | Orders | `Order` list filtered by `restaurant` + status. |
| `staff.purchases.tsx` | Purchases | `Purchase` list; optional create before finalize. |
| `staff.expenses.tsx` | Expenses | `Expense` list/create. |
| `staff.transactions.tsx` | Transactions | `Transaction` list. |
| `staff.ledger.tsx` | Ledger | `Ledger` read. |
| `staff.profile.tsx` | Auth | `User` + `Staff`. |

### 5.5 Customer (`customer.*`)

| Route file | Dummy / notes | Models / API |
| ---------- | ------------- | ------------ |
| `customer.index.tsx`, `customer.restaurants.tsx` | `dummyRestaurants` | `Restaurant` list (public or authenticated). |
| `customer.orders.tsx` | `dummyOrders` | `Order` for `customer=request.user`. |
| `customer.transactions.tsx` | `dummyTransactions` | `Transaction` filtered for customer context if modeled. |
| `customer.cart.tsx` | Local state | Build `lines` same as POS; `POST` order. |
| `customer.profile.tsx` | Auth | `User`. |

### 5.6 Shareholder (`shareholder.*`)

| Route file | Dummy / notes | Models / API |
| ---------- | ------------- | ------------ |
| `shareholder.index.tsx` | Balances | `User.balance`, withdrawal stats. |
| `shareholder.withdrawals.tsx` | `dummyWithdrawals` | `POST /api/shareholder-withdrawals/` as logged-in user; list own rows. |
| `shareholder.transactions.tsx` | `dummyTransactions` | Filter `Transaction` (`share_distribution`, etc.) for user. |
| `shareholder.profile.tsx` | Auth | `User`. |

---

## 6. Forms: fields to bind (model alignment)

Use this checklist when building serializers and forms together (owner/staff/super-admin as appropriate):

- **User:** `phone`, `name`, `role`, `is_shareholder`, `share_percentage`, `balance`, `due_balance`, `fcm_token`, `image`.
- **Restaurant:** `name`, `phone`, `logo`, `address`, `latitude`, `longitude`, `due_balance`, `subscription_start/end`, `is_open`, `per_transaction_fee`, `can_delivery` (`slug` auto on save).
- **Product / ProductItem:** `name`, `category`, `image`, `is_veg`, `is_active`; items: `unit`, `price`, `discount_type`, `discount`.
- **Order (create via API):** lines → `product_item_id` / `comboset_id`, `quantity`; header: `restaurant`, optional `customer`, `table`, `order_type`, address/geo, `payment_method`, `fcm_token`, `waiter`, `people_for`, `order_discount`.
- **Purchase:** `supplier`, line items `raw_material`, `price`, `quantity`; discount fields; call **`finalize`** when ready.
- **ShareholderWithdrawal:** `amount`, `remarks`; approve/reject via existing actions.

---

## 7. Implementation order (suggested)

1. **Env + HTTP client** — base URL, credentials, error handling.
2. **Auth + current user + restaurant context** (owner/staff scoping).
3. **Orders** — list/detail + POS create + `transition-status` (replaces largest cross-cutting dummy usage).
4. **Catalog stack** — units, categories, products, product items (unblocks POS fully).
5. **Purchases + stock logs + raw materials** — align with `finalize_purchase` and inventory services.
6. **Ledger, transactions, expenses** — financial screens.
7. **Super admin** — `SuperSetting`, global users/restaurants, withdrawals (partially done), notifications.

---

## 8. Dummy data file lifecycle

- **`web/src/constants/dummy-data.ts`:** remove imports from route files incrementally as each screen uses the API; keep **only** what is still needed for Storybook or offline demos if desired.
- **`web/src/constants/enums.ts`:** keep as the single source of **allowed string values** for selects and badges; sync with `models.py` when choices change.

---

*This blueprint was generated from `server/core/models.py`, `models.md`, `models_logic.md`, `server/core/api/*`, `server/core/services/*`, and a full file inventory of `web/src` (routes, components, lib).*
