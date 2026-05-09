# Model logic — MyRestro

This document ties `**server/core/models.py**` to how the app is expected to behave, including `**web/src**` (dummy data, enums, and UI flows). It is the single reference for **what is implemented in the ORM today** versus **what should live in services/API/signals** when the backend is wired up.

---

## 1. Current backend state


| Area                                   | Status                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Django **signals** (`post_save`, etc.) | **Not used** anywhere under `server/core`.                                                     |
| Dedicated **service** modules          | **None** in this repo.                                                                         |
| REST **views** / `urls`                | `server/core/views.py` is empty; `server/core/urls.py` has no routes.                          |
| **Admin**                              | Full CRUD for all models; no custom `save_model` / actions that mutate related money or stock. |


So: **almost all business rules are *not* enforced in the database layer** except what is listed in §2. Everything in §3–§5 is **design intent** derived from model fields, relations, and the frontend prototype.

---

## 2. Logic implemented on models (actual code)

### 2.1 `Restaurant.save`

- If `slug` is empty, generates a **unique slug** from `name` (`slugify`, max ~150 chars), appending `-1`, `-2`, … on collision.
- **Relation hub**: `User` → `Restaurant` (owner); most entities hang off `restaurant`.

### 2.2 `Order.save`

- If `order_id` is empty, sets `order_id` to  
`ORD-YYYYMMDD-<6 hex chars uppercase>` (date + random suffix).

### 2.3 `Purchase.save`

- If `purchase_id` is empty, sets `purchase_id` to  
`PUR-YYYYMMDD-<6 hex chars uppercase>`.

### 2.4 `Expense.save`

- If `expense_id` is empty, sets `expense_id` to  
`EXP-YYYYMMDD-<6 hex chars uppercase>`.

### 2.5 `ProductItem.discounted_price` (property)

- `**percentage`**: `price - (price * discount / 100)`, floored at `0`.
- `**flat**`: `price - discount`, floored at `0`.

No signal updates `Order.sub_total` / `Order.total` when `OrderItem` rows change; totals are **application responsibility** (see seed: `seed_order_flow.py` sets totals manually).

---

## 3. Entity relationships (high level)

```
User (auth, balance, due_balance, shareholder fields)
  ├── restaurants (Restaurant) ──┬── categories, units, suppliers, products, …
  │                              ├── orders (Order) ── order items
  │                              ├── purchases, expenses, ledgers, transactions, stock_logs
  │                              └── staff (Staff) → links User to Restaurant + role
  ├── customer_orders (Order.customer, optional)
  ├── served_orders (Order.waiter)
  ├── staff_profiles (Staff)
  ├── withdrawals (ShareholderWithdrawal)
  └── otps (Otp)

Product ── ProductItem (unit, price, discount) ── ProductRawMaterial ── RawMaterial
OrderItem → product, product_item, comboset (combo line)
PurchaseItem → raw_material; Purchase → supplier
StockLog → raw_material; optional links to purchase / purchase_item / order / order_item
Transaction → optional Ledger; Ledger = per-restaurant party balance rows (party_type + party_id string)
```

---

## 4. Enum-driven behaviour (schema contract)

These choices drive **valid states** in the UI (`web/src/constants/enums.ts`) and must match API validation:


| Enum                  | Backend model                                            | Notes                                                                                                                  |
| --------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `OrderStatus`         | `pending` → `accepted` → `running` → `ready`; `rejected` | Frontend lists all; kitchen/POS flows assume progression.                                                              |
| `PaymentStatus`       | `pending` / `success` / `failed`                         | Tied to orders and transactions.                                                                                       |
| `OrderType`           | `table` / `packing` / `delivery`                         | Table vs packing vs delivery address (`Order.address`, lat/long).                                                      |
| `TransactionCategory` | Fees, share, ledger, salary, etc.                        | See §5.2.                                                                                                              |
| `WithdrawalStatus`    | `pending` / `approved` / `**rejected`**                  | **Mismatch**: frontend dummy uses `"reject"` in places; backend value is `**rejected`**. Align before API integration. |
| `LedgerPartyType`     | `customer` / `staff` / `supplier`                        | `party_id` is a **string** (flexible FK to user id or supplier id as string).                                          |


`UserRole` in Django includes `super_admin`; the frontend enum only lists `owner`, `staff`, `customer` — super-admin is expected to be **admin-only**, not customer-app routes.

---

## 5. Intended business logic (services / API / optional signals)

Nothing below is enforced automatically today; it is **what the data model + frontend dummy data imply** you should implement.

### 5.1 Orders (`Order`, `OrderItem`)

- **Create order** (staff POS / customer): build lines from `ProductItem` (or `ComboSet`); compute `sub_total`, `discount`, `total` server-side; default `status=pending`, `payment_status=pending`.
- **Status workflow**: e.g. accept → running → ready; **reject** sets `reject_reason` and should not consume stock if you never moved stock on pending.
- **Guest orders**: `customer` may be `null` (dummy order `o3`); still link `restaurant`, optional `table`.
- **Waiter**: `waiter` is a `User` (staff) assigned to the order.
- **FCM**: `fcm_token` on order for push to customer device when status changes (frontend expects token field).

**Frontend (`staff.pos`)**: filters **active** products only; cart uses **list price** from dummy items — backend should use `**discounted_price`** for money consistency.

### 5.2 Payments & platform money (`Transaction`, `Restaurant`, `SuperSetting`)

- `**TransactionCategory.transaction_fee**`: when a restaurant takes an order payment, platform may charge `Restaurant.per_transaction_fee` or global `SuperSetting.per_transaction_fee` — dummy links txn remarks to orders (`tr1`, `tr3`).
- `**subscription_fee**`: recurring charge against restaurant or platform balance (`Restaurant.subscription_*`, `due_balance`).
- `**sms_usage**`: charge per SMS when using bulk SMS (`SuperSetting.sms_per_usage`).
- `**share_distribution` / `share_withdrawal**`: shareholder money movement (`User.is_shareholder`, `share_percentage`, `User.balance`).
- `**due_paid**`: reduces `Restaurant.due_balance` or similar when owner pays platform.
- `**ledger_credit` / `ledger_debit**`: tie to `Ledger` rows (`Transaction.ledger`).
- `**salary**`: staff payroll from restaurant or platform context.

`Transaction.transaction_type`: `**in**` = money into platform/restaurant context; `**out**` = outflow. `payment_status` mirrors payment lifecycle. `is_system` flags automated/platform-generated rows (dummy `tr2`, `tr4`).

### 5.3 Shareholder withdrawals (`ShareholderWithdrawal`)

- **Request**: create row `status=pending`, `user` must be shareholder (`User.is_shareholder`).
- **Approved** (intended): deduct `User.balance` (or move from pool), create `Transaction` with category `**share_withdrawal`**, `payment_status=success` when paid; optionally link ledger.
- **Rejected**: set `status=rejected`, `reject_reason`; no transaction.

### 5.4 Ledger (`Ledger`)

- Per `**restaurant`**, `**party_type**` + `**party_id**` (opaque id matching customer user, staff user, or supplier).
- `**type**`: `debit` vs `credit` — drives display on owner ledger screens (`owner.ledger`, `owner.ledger_.$partyType.$partyId`).
- Creating/updating ledger entries should stay **consistent** with related `Transaction` rows when you link them.

### 5.5 Purchases & inventory (`Purchase`, `PurchaseItem`, `RawMaterial`, `StockLog`)

- **On purchase posted** (service layer):  
  - Increase `**RawMaterial.stock`** by purchased quantity (unit-aligned).  
  - Create `**StockLog**` with `type=in`, link `purchase` / `purchase_item`.  
  - Update `**PurchaseItem.total**` from `price * quantity`; roll up `Purchase.subtotal`/`total` with `discount_type` / `discount` (mirror `ProductItem` discount semantics).
- **Supplier ledger**: optional `Ledger` row for supplier party.

### 5.6 Orders → raw material consumption (`ProductRawMaterial`, `StockLog`, `OrderItem`)

- When an order is **confirmed or completed** (policy choice): for each `OrderItem` with `product_item`, resolve `**ProductRawMaterial`** rows (for that item or product-level) and compute consumption = `raw_material_quantity * order_item.quantity` (units must match `RawMaterial.unit`).
- Create `**StockLog**` `type=out`, link `order` / `order_item`, decrement `**RawMaterial.stock**`.
- If stock insufficient: reject at service layer or block confirmation (not in model).

### 5.7 Expenses (`Expense`)

- Standalone restaurant cost; you may optionally mirror as `**Transaction**` or ledger entry for reporting (not in models explicitly).

### 5.8 Staff (`Staff`)

- `**is_suspend**`: suspended staff should not be assigned new orders (enforcement in API/permissions).
- **Salary**: `salary` / `salary_per_day` for reporting or periodic `**Transaction`** `category=salary`.

### 5.9 Bulk notifications (`BulkNotification`)

- `**receivers**`: JSON list of user ids (or phones) to target; `**type**` `sms` vs `push`; billing may use `sms_usage` transactions.

### 5.10 Auth / OTP (`Otp`)

- `**purpose**` distinguishes flows; `**is_used**` prevents replay; link to `User` when known.

---

## 6. Frontend surfaces vs models (quick map)


| Area        | Routes / data                                                              | Models involved                                                              |
| ----------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Super admin | `superadmin.*`, `dummySuperSettings`, withdrawals, transactions            | `SuperSetting`, `ShareholderWithdrawal`, `Transaction`, `User`, `Restaurant` |
| Owner       | `owner.orders*`, `owner.purchases*`, `owner.stocklog*`, `owner.ledger*`, … | `Order`, `Purchase`, `StockLog`, `Ledger`, …                                 |
| Staff       | `staff.pos`, `staff.lineorders`, …                                         | `Order`, `Product`, `Table`, `Staff` roles                                   |
| Shareholder | `shareholder.withdrawals`, …                                               | `ShareholderWithdrawal`, `Transaction`                                       |
| Customer    | `customer.orders`, cart (placeholder)                                      | `Order`, `User` as customer                                                  |


---

## 7. Where to implement new logic


| Concern                                                 | Recommended place                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Side effects on create/update (balances, stock, ledger) | **Service functions** called from DRF viewsets (easier to test than fat models).                        |
| Cross-cutting “after commit” hooks                      | Django `**post_save`** / `**transaction.on_commit**` if you need true decoupling — **not present yet**. |
| ID generation                                           | Already on `**Restaurant`**, `**Order**`, `**Purchase**`, `**Expense**` `save()`.                       |


---

## 8. Seed / dev data

- `**server/core/management/commands/seed_order_flow.py**`: creates a sample order with items and updates totals manually — illustrates that **totals are not auto-derived** from items in the model layer.

---

*Generated from `server/core/models.py`, `server/core/admin.py`, and `web/src/constants/dummy-data.ts` / `enums.ts`.*