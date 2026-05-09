# Restaurant field audit (`restaurant` FK on models vs `web/src`)

This document lists every Django model that defines a `restaurant` foreign key (see `server/core/models.py`), then records where `web/src` tables, forms, or read-only detail blocks omit a visible **restaurant** label (name or id) even though the underlying entity is tied to a restaurant.

Scope notes:

- **Owner / staff portals** load most lists with `?restaurant_id=` from `useRestaurantScope()`. A missing “Restaurant” column is often *logically redundant* when the user is pinned to one restaurant, but it is still inconsistent with screens that already show it (`owner.staff.tsx`, `owner.tables.tsx`) and weakens clarity when switching restaurants or debugging.
- **Customer portal** can aggregate orders across restaurants; missing restaurant there is a **functional** gap.

---

## 1. Backend models with a `restaurant` field


| Model                | `server/core/models.py` (approx.) | API list serializer (`list_serializers.py`)                                                 |
| -------------------- | --------------------------------- | ------------------------------------------------------------------------------------------- |
| `Supplier`           | L244–255                          | `SupplierListSerializer` — includes `restaurant` (PK only)                                  |
| `Unit`               | L258–268                          | `UnitListSerializer` — includes `restaurant`                                                |
| `Category`           | L271–284                          | `CategoryListSerializer` — includes `restaurant`                                            |
| `Product`            | L287–299                          | `ProductListSerializer` — includes `restaurant`                                             |
| `RawMaterial`        | L324–340                          | `RawMaterialListSerializer` — includes `restaurant`                                         |
| `ProductRawMaterial` | L343–358                          | `ProductRawMaterialListSerializer` — includes `restaurant`                                  |
| `ComboSet`           | L361–376                          | `ComboSetListSerializer` — includes `restaurant`                                            |
| `Table`              | L379–395                          | `TableListSerializer` — includes `restaurant`, `**restaurant_name`**                        |
| `Staff`              | L398–412                          | `StaffListSerializer` — includes `restaurant`, `**restaurant_name**`                        |
| `Order`              | L415–457                          | `OrderSerializer` (`serializers.py`) — includes `restaurant` (PK); **no `restaurant_name`** |
| `Purchase`           | L476–494                          | `PurchaseSerializer` — includes `restaurant`; **no `restaurant_name`**                      |
| `Expense`            | L511–528                          | `ExpenseListSerializer` — includes `restaurant`; **no `restaurant_name`**                   |
| `Ledger`             | L531–543                          | `LedgerListSerializer` — includes `restaurant`; **no `restaurant_name`**                    |
| `Transaction`        | L546–564                          | `TransactionListSerializer` — includes `restaurant`; **no `restaurant_name`**               |
| `StockLog`           | L567–581                          | `StockLogListSerializer` — includes `restaurant`; **no `restaurant_name`**                  |
| `BulkNotification`   | L611–624                          | `BulkNotificationListSerializer` — includes `restaurant`; **no `restaurant_name`**          |


`Restaurant` itself is the root entity (no `restaurant` FK). `ProductItem`, `OrderItem`, `PurchaseItem`, etc. inherit scope via their parent and are out of scope for this checklist.

---

## 2. `web/src` — list tables (`DataTable` / card lists) without a Restaurant column

These screens bind to models that have `restaurant`, but the UI does **not** show which restaurant a row belongs to (no `restaurant_name` and no `restaurant` / `#id` column).


| Area     | File                                       | Model / data                                                                                            |
| -------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Owner    | `web/src/routes/owner.orders.tsx`          | `Order`                                                                                                 |
| Owner    | `web/src/routes/owner.products.tsx`        | `Product`                                                                                               |
| Owner    | `web/src/routes/owner.purchases.tsx`       | `Purchase`                                                                                              |
| Owner    | `web/src/routes/owner.expenses.tsx`        | `Expense`                                                                                               |
| Owner    | `web/src/routes/owner.suppliers.tsx`       | `Supplier`                                                                                              |
| Owner    | `web/src/routes/owner.units.tsx`           | `Unit`                                                                                                  |
| Owner    | `web/src/routes/owner.combos.tsx`          | `ComboSet`                                                                                              |
| Owner    | `web/src/routes/owner.rawmaterials.tsx`    | `RawMaterial`                                                                                           |
| Owner    | `web/src/routes/owner.stocklog.tsx`        | `StockLog`                                                                                              |
| Owner    | `web/src/routes/owner.transactions.tsx`    | `Transaction`                                                                                           |
| Owner    | `web/src/routes/owner.ledger.tsx`          | `Ledger`                                                                                                |
| Owner    | `web/src/routes/owner.categories.tsx`      | `Category` (custom list/grid; no restaurant label per row)                                              |
| Staff    | `web/src/routes/staff.transactions.tsx`    | `Transaction`                                                                                           |
| Staff    | `web/src/routes/staff.purchases.tsx`       | `Purchase`                                                                                              |
| Staff    | `web/src/routes/staff.expenses.tsx`        | `Expense`                                                                                               |
| Staff    | `web/src/routes/staff.ledger.tsx`          | `Ledger`                                                                                                |
| Customer | `web/src/routes/customer.orders.tsx`       | `Order` (cards + detail sheet — **no restaurant**; customer may have many restaurants)                  |
| Customer | `web/src/routes/customer.transactions.tsx` | Uses order-style rows; confirm payload — if sourced from `Order` / restaurant-scoped data, same concern |


**Already showing restaurant (reference):**

- `owner.staff.tsx` — “Restaurant” column via `restaurant_name` / `restaurant`.
- `owner.tables.tsx` — “Restaurant” via `restaurant_name`.
- `owner.users.tsx` / `superadmin.users.tsx` — staff placements show restaurant.
- `superadmin.transactions.tsx` — “Restaurant” via `restName(...)`.
- `superadmin.notifications.tsx` — “Restaurant” column.

---

## 3. `web/src` — detail / view sections without a Restaurant field

These read-only or mixed-form pages correspond to models with `restaurant`, but there is no `<ViewField label="Restaurant" … />` (or equivalent) even when the API exposes `restaurant` (PK).


| File                                         | Entity                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| `web/src/routes/owner.orders_.$id.tsx`       | `Order`                                                                  |
| `web/src/routes/owner.purchases_.$id.tsx`    | `Purchase`                                                               |
| `web/src/routes/owner.expenses_.$id.tsx`     | `Expense`                                                                |
| `web/src/routes/owner.products_.$id.tsx`     | `Product`                                                                |
| `web/src/routes/owner.rawmaterials_.$id.tsx` | `RawMaterial` (detail section; nested stock table also omits restaurant) |
| `web/src/routes/owner.transactions_.$id.tsx` | `Transaction`                                                            |
| `web/src/routes/owner.stocklog_.$id.tsx`     | `StockLog`                                                               |
| `web/src/routes/owner.staff_.$id.tsx`        | `Staff` (list shows restaurant; detail does not)                         |
| `web/src/routes/staff.transactions_.$id.tsx` | `Transaction` (mirror of owner detail)                                   |


**Detail pages that already include restaurant where relevant:**

- `owner.tables_.$id.tsx` — conditional `ViewField` for `restaurant_name`.
- `superadmin.transactions_.$id.tsx` — `ViewField` “Restaurant”.
- `superadmin.notifications_.$id.tsx` — `ViewField` “Restaurant”.

`owner.combos_.$id.tsx` is primarily an editor; the loaded combo row includes `restaurant` from the API but the UI does not surface it.

---

## 4. Nested tables tied to a `restaurant` model (optional polish)


| File                                         | Table                                         | Notes                                                                             |
| -------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------- |
| `web/src/routes/owner.products_.$id.tsx`     | “Raw Material Mapping” (`ProductRawMaterial`) | Each row has `restaurant` in API; column omitted (always same scoped restaurant). |
| `web/src/routes/owner.purchases_.$id.tsx`    | Related stock logs                            | `StockLog` has `restaurant`; optional column.                                     |
| `web/src/routes/owner.rawmaterials_.$id.tsx` | Stock log sub-table                           | Same as above.                                                                    |


---

## 5. Forms and `restaurant_id` / body fields

Most create/update flows correctly pass `**restaurant_id` as a query parameter** from `useRestaurantScope()` (see `web/src/hooks/use-rest-api.ts` and route handlers such as `owner.suppliers.tsx`, `owner.categories.tsx`, `ProductFormPage.tsx`). That satisfies the backend without an HTML field named `restaurant`.

**Explicit restaurant selection in forms (present):**

- `web/src/routes/owner.users.tsx` — `name="restaurant_id"` when adding staff to a restaurant.
- `web/src/routes/superadmin.users.tsx` — same pattern.
- `web/src/components/owner/TableFormPage.tsx` — restaurant choice when adding a table (multi-restaurant owners).

**Parity gap (optional product requirement):**

- `web/src/components/owner/ProductFormPage.tsx` — no restaurant dropdown; creation always targets the **currently scoped** restaurant. If product creation should match **table** behavior (pick any owned restaurant without changing global scope), add a restaurant selector like `TableFormPage` and pass the chosen id into `?restaurant_id=`.

No separate form field is *required* for API correctness for most owner CRUD as long as scope is set.

---

## 6. Recommended fixes (prioritized)

### P0 — Customer orders across restaurants

1. **Backend:** Extend `OrderSerializer` (and any lightweight list serializer used for customer order lists) with `restaurant_name` (e.g. `CharField(source="restaurant.name", read_only=True)`) or a nested `{ id, name }` object.
2. **Frontend:** `web/src/routes/customer.orders.tsx` — extend `OrderRow`, show restaurant name on each card and in the detail sheet.

### P1 — Owner/staff consistency (multi-restaurant clarity)

1. **Backend (batch):** For list serializers that only expose `restaurant` as PK (`Supplier`, `Unit`, `Category`, `Product`, `RawMaterial`, `ComboSet`, `Expense`, `Transaction`, `Ledger`, `StockLog`, `BulkNotification`, `ProductRawMaterial`), add `restaurant_name = serializers.CharField(source="restaurant.name", read_only=True)` following `TableListSerializer` / `StaffListSerializer`.
2. **Frontend:** For each owner/staff `DataTable` in section 2, add a **Restaurant** column when `user.restaurant_ids.length > 1` (from `useAuth()`), or always show it for simpler UX.
3. **Detail pages:** In section 3 files, resolve `restaurant` PK with `useRestaurants()` (or new API field) and add `<ViewField label="Restaurant" value={…} />`.

### P2 — Polish

- `owner.categories.tsx` — optional subtitle or badge per root category with restaurant name when multiple restaurants exist.
- Nested tables (section 4) — only if you need audit-style clarity.

### Unrelated but noticed (optional)

- `web/src/routes/staff.ledger.tsx` — row links use `/owner/ledger/...`; staff users may need `/staff/...` routes if those exist.

---

## 7. Quick reference — files to touch for a “full” restaurant column pass

**Backend:** `server/core/api/list_serializers.py`, optionally `server/core/api/serializers.py` (`OrderSerializer`).

**Frontend (lists):**  
`owner.orders.tsx`, `owner.products.tsx`, `owner.purchases.tsx`, `owner.expenses.tsx`, `owner.suppliers.tsx`, `owner.units.tsx`, `owner.combos.tsx`, `owner.rawmaterials.tsx`, `owner.stocklog.tsx`, `owner.transactions.tsx`, `owner.ledger.tsx`, `owner.categories.tsx`, `staff.transactions.tsx`, `staff.purchases.tsx`, `staff.expenses.tsx`, `staff.ledger.tsx`, `customer.orders.tsx`, `customer.transactions.tsx` (if applicable).

**Frontend (details):**  
`owner.orders_.$id.tsx`, `owner.purchases_.$id.tsx`, `owner.expenses_.$id.tsx`, `owner.products_.$id.tsx`, `owner.rawmaterials_.$id.tsx`, `owner.transactions_.$id.tsx`, `owner.stocklog_.$id.tsx`, `owner.staff_.$id.tsx`, `staff.transactions_.$id.tsx`, `owner.combos_.$id.tsx` (display-only when not creating).

---

*Generated from repository scan: models in `server/core/models.py`, serializers in `server/core/api/list_serializers.py` / `serializers.py`, and routes under `web/src`.*