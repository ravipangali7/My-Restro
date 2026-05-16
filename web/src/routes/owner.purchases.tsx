import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { OwnerEntityCard, OwnerEntityCardStack, ownerListActionClass, ownerListActionSecondaryClass } from "@/components/owner/OwnerEntityCard";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { usePurchases, useRawMaterials, useRestaurants, useSuppliers } from "@/hooks/use-rest-api";
import { apiDelete, apiPatch, apiPost } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ownerStaffShowsRestaurantColumn } from "@/lib/restaurant-table-column";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { MapPin, Plus, ShoppingCart, Trash2 } from "lucide-react";

type PurchaseRow = {
  id: number;
  purchase_id: string;
  supplier: number;
  subtotal: string | number;
  discount_type: string;
  discount: string | number;
  total: string | number;
  restaurant?: number;
  restaurant_name?: string;
  items?: { id: number; raw_material: number; price: string | number; quantity: string | number; total: string | number }[];
};

function parseEditSearch(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export const Route = createFileRoute("/owner/purchases")({
  validateSearch: (search: Record<string, unknown>) => ({
    edit: parseEditSearch(search.edit),
  }),
  component: PurchasesPage,
});

function PurchasesPage() {
  const navigate = useNavigate();
  const { edit: editFromSearch } = Route.useSearch();
  const { token, user } = useAuth();
  const qc = useQueryClient();
  const { restaurantId, restaurantIds, setRestaurantId } = useRestaurantScope();
  const showRestaurantCol = ownerStaffShowsRestaurantColumn(user);
  const { data: purchases, isLoading, isError, error } = usePurchases();
  const { data: restaurantsRaw = [] } = useRestaurants();
  const restaurants = restaurantsRaw as { id: number; name: string }[];

  const restaurantOptionsIds = useMemo(() => {
    const ids = new Set(restaurantIds);
    if (restaurantId != null) ids.add(restaurantId);
    return [...ids].sort((a, b) => a - b);
  }, [restaurantIds, restaurantId]);

  const restaurantOptions = useMemo(
    () => restaurants.filter((r) => restaurantOptionsIds.includes(r.id)),
    [restaurants, restaurantOptionsIds],
  );

  const [showForm, setShowForm] = useState(false);
  const { requestConfirm, ConfirmDialog } = useConfirmAction();
  const [formRestaurantId, setFormRestaurantId] = useState<number | null>(null);
  const formDataRestaurantId = useMemo(() => {
    if (!showForm) return restaurantId;
    return formRestaurantId ?? restaurantId ?? restaurantIds[0] ?? null;
  }, [showForm, formRestaurantId, restaurantId, restaurantIds]);

  const { data: suppliers } = useSuppliers(formDataRestaurantId);
  const { data: rawMaterials } = useRawMaterials(formDataRestaurantId);

  const [editPurchase, setEditPurchase] = useState<PurchaseRow | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [discountType, setDiscountType] = useState("flat");
  const [discount, setDiscount] = useState("0");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [purchaseItems, setPurchaseItems] = useState([{ raw_material: "", price: "", quantity: "", total: 0 }]);

  const rows = (purchases as PurchaseRow[] | undefined) ?? [];

  const openAdd = () => {
    setEditPurchase(null);
    setFormRestaurantId(restaurantId ?? restaurantIds[0] ?? null);
    setSupplierId("");
    setDiscountType("flat");
    setDiscount("0");
    setFormError(null);
    setPurchaseItems([{ raw_material: "", price: "", quantity: "", total: 0 }]);
    setShowForm(true);
  };
  const openEdit = (p: PurchaseRow) => {
    setEditPurchase(p);
    setFormRestaurantId(p.restaurant ?? restaurantId ?? restaurantIds[0] ?? null);
    setSupplierId(p.supplier != null ? String(p.supplier) : "");
    setDiscountType(p.discount_type || "flat");
    setDiscount(String(p.discount ?? 0));
    setFormError(null);
    const items = p.items ?? [];
    setPurchaseItems(
      items.map((i) => ({
        raw_material: String(i.raw_material),
        price: String(i.price),
        quantity: String(i.quantity),
        total: Number(i.total),
      })),
    );
    setShowForm(true);
  };

  useEffect(() => {
    if (editFromSearch == null) return;
    if (isLoading && purchases == null) return;
    const list = (purchases as PurchaseRow[] | undefined) ?? [];
    const row = list.find((r) => r.id === editFromSearch);
    if (!row) {
      void navigate({ to: "/owner/purchases", search: {}, replace: true });
      return;
    }
    openEdit(row);
    void navigate({ to: "/owner/purchases", search: {}, replace: true });
  }, [editFromSearch, isLoading, navigate, purchases]);

  const refresh = () => void qc.invalidateQueries({ queryKey: ["purchases"] });
  const calcSubtotal = () =>
    purchaseItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
  const calcTotal = () => {
    const subtotal = calcSubtotal();
    const d = Number(discount || 0);
    if (discountType === "percentage") return Math.max(0, subtotal - subtotal * (d / 100));
    return Math.max(0, subtotal - d);
  };
  const onItemChange = (idx: number, key: "raw_material" | "price" | "quantity", value: string) => {
    setPurchaseItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const next = { ...item, [key]: value };
        if (key === "raw_material") {
          const selected = (rawMaterials as { id: number; price?: string | number }[] | undefined)?.find(
            (rm) => String(rm.id) === value,
          );
          if (selected?.price != null) {
            next.price = String(selected.price);
          }
        }
        next.total = Number(next.price || 0) * Number(next.quantity || 0);
        return next;
      }),
    );
  };
  const handleSave = async () => {
    if (!token || formRestaurantId == null) return;
    if (!supplierId) {
      setFormError("Supplier is required.");
      return;
    }
    if (purchaseItems.length === 0 || purchaseItems.some((x) => !x.raw_material || Number(x.quantity) <= 0)) {
      setFormError("Add at least one valid item with material and quantity.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body = {
        restaurant: formRestaurantId,
        supplier: Number(supplierId),
        discount_type: discountType,
        discount,
        items: purchaseItems.map((x) => ({
          raw_material: Number(x.raw_material),
          quantity: x.quantity,
          price: x.price,
        })),
      };
      if (editPurchase) {
        await apiPatch(`/api/purchases/${editPurchase.id}/`, body, token);
      } else {
        await apiPost(`/api/purchases/`, body, token);
      }
      setRestaurantId(formRestaurantId);
      refresh();
      setShowForm(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save purchase.");
    } finally {
      setSaving(false);
    }
  };
  const handleDelete = (id: number) => {
    if (!token) return;
    requestConfirm({
      title: "Delete purchase",
      message: "Delete this purchase? This cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
      onConfirm: async () => {
        await apiDelete(`/api/purchases/${id}/`, token);
        refresh();
      },
    });
  };

  const supplierName = (id: number) =>
    (suppliers as { id: number; name: string }[] | undefined)?.find((s) => s.id === id)?.name ?? "—";

  if (isError) {
    return <p className="text-sm text-error">{error instanceof Error ? error.message : "Failed to load purchases."}</p>;
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-semibold text-lg text-foreground">Purchases</h2>
        <button
          onClick={openAdd}
          className="h-10 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary-600 flex items-center gap-1"
        >
          <Plus size={14} /> New Purchase
        </button>
      </div>
      {isLoading && purchases === undefined ? (
        <p className="text-sm text-text-muted py-8">Loading purchases…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-text-muted">No purchases yet.</p>
      ) : (
        <OwnerEntityCardStack>
          {rows.map((p) => (
            <OwnerEntityCard
              key={p.id}
              onClick={() => {
                void navigate({ to: "/owner/purchases/$id", params: { id: String(p.id) } });
              }}
              leading={
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ShoppingCart strokeWidth={2} aria-hidden />
                </div>
              }
              title={p.purchase_id}
              subtitle={
                <span className="text-text-secondary">
                  Supplier: <span className="font-medium text-foreground">{supplierName(p.supplier)}</span>
                </span>
              }
              meta={
                <>
                  {showRestaurantCol && p.restaurant_name ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
                      <MapPin size={12} className="shrink-0 text-primary" aria-hidden />
                      {p.restaurant_name}
                    </span>
                  ) : null}
                  <span className="font-mono text-base font-semibold text-foreground">₹{Number(p.total).toLocaleString()}</span>
                </>
              }
              actions={
                <>
                  <Link
                    to="/owner/purchases/$id"
                    params={{ id: String(p.id) }}
                    onClick={(e) => e.stopPropagation()}
                    className={ownerListActionClass}
                  >
                    View purchase
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(p);
                    }}
                    className={ownerListActionSecondaryClass}
                  >
                    Edit
                  </button>
                </>
              }
            />
          ))}
        </OwnerEntityCardStack>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-display font-semibold text-lg text-foreground mb-4">
              {editPurchase ? "Edit Purchase" : "New Purchase"}
            </h3>
            {formError && <p className="text-sm text-error mb-3">{formError}</p>}
            <div className="space-y-4 mb-6">
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block">Purchase ID</label>
                <input
                  type="text"
                  defaultValue={editPurchase?.purchase_id || ""}
                  readOnly
                  className="w-full h-11 px-4 rounded-xl border border-border bg-surface-alt text-sm text-text-muted outline-none"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block">Restaurant *</label>
                <select
                  value={formRestaurantId ?? ""}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    setFormRestaurantId(v);
                    setSupplierId("");
                    setPurchaseItems([{ raw_material: "", price: "", quantity: "", total: 0 }]);
                  }}
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                >
                  <option value="" disabled>
                    Select restaurant
                  </option>
                  {restaurantOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block">Supplier *</label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                >
                  <option value="">Select supplier</option>
                  {(suppliers as { id: number; name: string }[] | undefined)?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="bg-inline-form-bg border border-inline-form-border rounded-xl mb-6">
              <div className="bg-inline-form-header px-4 py-2.5 rounded-t-xl flex items-center justify-between">
                <span className="text-xs font-semibold text-text-secondary uppercase">Purchase Items</span>
                <button
                  onClick={() =>
                    setPurchaseItems([...purchaseItems, { raw_material: "", price: "", quantity: "", total: 0 }])
                  }
                  className="text-xs font-semibold text-primary hover:text-primary-600"
                >
                  + Add Item
                </button>
              </div>
              <div className="divide-y divide-border">
                {purchaseItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-5 gap-2 px-4 py-3 items-center">
                    <select
                      value={item.raw_material}
                      onChange={(e) => onItemChange(idx, "raw_material", e.target.value)}
                      className="h-9 px-2 rounded-lg border border-border bg-card text-xs col-span-1"
                    >
                      <option value="">Raw Material</option>
                      {(rawMaterials as { id: number; name: string }[] | undefined)?.map((rm) => (
                        <option key={rm.id} value={rm.id}>
                          {rm.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => onItemChange(idx, "quantity", e.target.value)}
                      placeholder="Qty"
                      className="h-9 px-2 rounded-lg border border-border bg-card text-xs"
                    />
                    <input
                      type="number"
                      value={item.price}
                      onChange={(e) => onItemChange(idx, "price", e.target.value)}
                      placeholder="Price"
                      className="h-9 px-2 rounded-lg border border-border bg-card text-xs"
                    />
                    <input
                      type="text"
                      value={item.total}
                      readOnly
                      className="h-9 px-2 rounded-lg border border-border bg-surface-alt text-xs text-text-muted"
                    />
                    <button
                      onClick={() => setPurchaseItems(purchaseItems.filter((_, i) => i !== idx))}
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-error hover:bg-error/10"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-3 mb-6">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-sm font-medium text-text-secondary mb-1.5 block">Discount Type</label>
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value)}
                    className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                  >
                    <option value="flat">Flat</option>
                    <option value="percentage">Percentage</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-sm font-medium text-text-secondary mb-1.5 block">Discount</label>
                  <input
                    type="number"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="text-sm text-text-secondary mb-4">
              Subtotal: <span className="font-semibold">₹{calcSubtotal().toLocaleString()}</span> | Total:{" "}
              <span className="font-semibold">₹{calcTotal().toLocaleString()}</span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 h-11 rounded-xl border border-border text-sm font-semibold text-text-secondary hover:bg-surface"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-600 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Purchase"}
              </button>
            </div>
          </div>
        </div>
      )}
      {ConfirmDialog}
    </>
  );
}
