import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { DiscountType } from "@/constants/enums";
import {
  useCategories,
  useProductItems,
  useProductRawMaterials,
  useProducts,
  useRawMaterials,
  useRestaurants,
  useUnits,
} from "@/hooks/use-rest-api";
import { apiDelete, apiPatch, apiPatchForm, apiPost, apiPostForm, resolveMediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { Plus, Trash2 } from "lucide-react";

type DiscountKind = (typeof DiscountType)[number];

interface ProductRow {
  id: number;
  restaurant: number;
  name: string;
  category: number | null;
  image?: string | null;
  is_veg: boolean;
  is_active: boolean;
}

interface ProductItemRow {
  id: number;
  product: number;
  unit: number;
  price: string | number;
  discount_type: string;
  discount: string | number;
}

interface ProductRawMaterialListRow {
  id: number;
  product: number;
  product_item: number | null;
  raw_material: number;
  raw_material_quantity: string | number;
}

interface VariantFormRow {
  key: string;
  serverId?: number;
  unitId: string;
  price: string;
  discountType: DiscountKind;
  discount: string;
}

interface RawMaterialFormRow {
  key: string;
  serverId?: number;
  rawMaterialId: string;
  quantity: string;
}

function newVariantRow(defaultUnitId: string): VariantFormRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    unitId: defaultUnitId,
    price: "",
    discountType: "flat",
    discount: "0",
  };
}

function newRawMaterialRow(): RawMaterialFormRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    rawMaterialId: "",
    quantity: "",
  };
}

export function ProductFormPage({ productId }: { productId?: number }) {
  const isEdit = productId != null;
  const navigate = useNavigate();
  const editorRestaurantId = useRouterState({
    select: (s) => (s.location.state as { editorRestaurantId?: number } | undefined)?.editorRestaurantId,
  });
  const queryClient = useQueryClient();
  const { token } = useAuth();
  const { restaurantId, setRestaurantId, restaurantIds } = useRestaurantScope();
  const { data: restaurantsRaw = [] } = useRestaurants();
  const restaurants = restaurantsRaw as { id: number; name: string }[];
  const { data: products = [], isLoading: productsLoading } = useProducts(restaurantId);
  const { data: categories = [] } = useCategories(restaurantId);
  const { data: items = [] } = useProductItems(restaurantId);
  const { data: units = [] } = useUnits(restaurantId);
  const { data: rawMaterials = [] } = useRawMaterials(restaurantId);
  const { data: prms = [], isFetched: prmsFetched } = useProductRawMaterials(restaurantId);

  const unitList = units as { id: number; name: string; symbol: string }[];
  const defaultUnitId = unitList.length ? String(unitList[0].id) : "";

  const editingProduct = useMemo(() => {
    if (!isEdit) return null;
    return ((products as ProductRow[]) ?? []).find((p) => p.id === productId) ?? null;
  }, [isEdit, productId, products]);

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [isVeg, setIsVeg] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [variants, setVariants] = useState<VariantFormRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [removedVariantIds, setRemovedVariantIds] = useState<number[]>([]);
  const [rawMaterialRows, setRawMaterialRows] = useState<RawMaterialFormRow[]>([]);
  const [removedRawMaterialIds, setRemovedRawMaterialIds] = useState<number[]>([]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    if (!isEdit || editorRestaurantId == null) return;
    if (restaurantIds.includes(editorRestaurantId)) {
      setRestaurantId(editorRestaurantId);
    }
  }, [isEdit, editorRestaurantId, restaurantIds, setRestaurantId]);

  useEffect(() => {
    if (!defaultUnitId) return;
    if (!isEdit) {
      setVariants((v) => (v.length ? v : [newVariantRow(defaultUnitId)]));
      return;
    }
    if (!editingProduct) return;
    setName(editingProduct.name);
    setCategoryId(editingProduct.category != null ? String(editingProduct.category) : "");
    setIsVeg(editingProduct.is_veg);
    setIsActive(editingProduct.is_active);
    setImageFile(null);
    setFormError(null);
    setRemovedVariantIds([]);
    const forProduct = (items as ProductItemRow[]).filter((pi) => pi.product === editingProduct.id);
    if (forProduct.length === 0) {
      setVariants([newVariantRow(defaultUnitId)]);
    } else {
      setVariants(
        forProduct.map((pi) => ({
          key: `srv-${pi.id}`,
          serverId: pi.id,
          unitId: String(pi.unit),
          price: String(pi.price),
          discountType: (DiscountType.includes(pi.discount_type as DiscountKind)
            ? pi.discount_type
            : "flat") as DiscountKind,
          discount: String(pi.discount),
        })),
      );
    }
  }, [defaultUnitId, isEdit, editingProduct, items]);

  useEffect(() => {
    if (isEdit) return;
    setRawMaterialRows([]);
    setRemovedRawMaterialIds([]);
  }, [isEdit]);

  useEffect(() => {
    if (!isEdit || !editingProduct || !prmsFetched) return;
    const list = prms as ProductRawMaterialListRow[];
    const forProduct = list.filter((p) => p.product === editingProduct.id && p.product_item == null);
    setRawMaterialRows(
      forProduct.map((p) => ({
        key: `srv-prm-${p.id}`,
        serverId: p.id,
        rawMaterialId: String(p.raw_material),
        quantity: String(p.raw_material_quantity),
      })),
    );
    setRemovedRawMaterialIds([]);
  }, [isEdit, editingProduct, prms, prmsFetched]);

  const addVariantRow = () => {
    if (!defaultUnitId) return;
    setVariants((v) => [...v, newVariantRow(defaultUnitId)]);
  };

  const updateVariant = (key: string, patch: Partial<VariantFormRow>) => {
    setVariants((v) => v.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const removeVariant = (row: VariantFormRow) => {
    setVariants((v) => v.filter((r) => r.key !== row.key));
    if (row.serverId != null) {
      setRemovedVariantIds((ids) => (ids.includes(row.serverId!) ? ids : [...ids, row.serverId!]));
    }
  };

  const validateVariants = (): string | null => {
    if (!defaultUnitId) return "Add at least one unit (Owner -> Units) before creating variants.";
    if (variants.length === 0) return "Add at least one variant (size / unit and price).";
    for (const r of variants) {
      if (!r.unitId) return "Each variant needs a unit.";
      const pr = Number.parseFloat(r.price);
      if (r.price.trim() === "" || Number.isNaN(pr) || pr < 0) return "Enter a valid price for each variant.";
      const disc = Number.parseFloat(r.discount);
      if (r.discount.trim() === "" || Number.isNaN(disc) || disc < 0) return "Enter a valid discount (use 0 for none).";
      if (r.discountType === "percentage" && disc > 100) return "Percentage discount cannot exceed 100%.";
    }
    return null;
  };

  const persistVariantsForNewProduct = async (newProductId: number) => {
    if (restaurantId == null || !token) return;
    for (const r of variants) {
      await apiPost(
        `/api/product-items/?restaurant_id=${restaurantId}`,
        {
          product: newProductId,
          unit: Number.parseInt(r.unitId, 10),
          price: r.price,
          discount_type: r.discountType,
          discount: r.discount,
        },
        token,
      );
    }
  };

  const persistProductRawMaterialsForNewProduct = async (newProductId: number) => {
    if (restaurantId == null || !token) return;
    for (const r of rawMaterialRows) {
      if (!r.rawMaterialId.trim()) continue;
      await apiPost(
        `/api/product-raw-materials/?restaurant_id=${restaurantId}`,
        {
          product: newProductId,
          raw_material: Number.parseInt(r.rawMaterialId, 10),
          raw_material_quantity: r.quantity.trim() === "" ? "0" : r.quantity,
        },
        token,
      );
    }
  };

  const addRawMaterialRow = () => {
    setRawMaterialRows((rows) => [...rows, newRawMaterialRow()]);
  };

  const updateRawMaterialRow = (key: string, patch: Partial<RawMaterialFormRow>) => {
    setRawMaterialRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const removeRawMaterialRow = (row: RawMaterialFormRow) => {
    setRawMaterialRows((rows) => rows.filter((r) => r.key !== row.key));
    if (row.serverId != null) {
      setRemovedRawMaterialIds((ids) => (ids.includes(row.serverId!) ? ids : [...ids, row.serverId!]));
    }
  };

  const validateRawMaterials = (): string | null => {
    const seenRm = new Set<number>();
    for (const r of rawMaterialRows) {
      const mat = r.rawMaterialId.trim();
      const qtyStr = r.quantity.trim();
      if (mat === "" && qtyStr === "") continue;
      if (mat === "") return "Each recipe line needs a raw material, or clear the quantity.";
      if (qtyStr === "") return "Enter a quantity for each selected raw material.";
      const rid = Number.parseInt(mat, 10);
      const q = Number.parseFloat(qtyStr);
      if (Number.isNaN(rid)) return "Invalid raw material selection.";
      if (Number.isNaN(q) || q < 0) return "Enter a valid non-negative quantity for each raw material.";
      if (seenRm.has(rid)) return "Duplicate raw materials: each ingredient should appear once.";
      seenRm.add(rid);
    }
    return null;
  };

  const goBack = () => navigate({ to: "/owner/products" });

  const onFormRestaurantChange = (nextId: number) => {
    setRestaurantId(nextId);
    if (!isEdit) {
      setCategoryId("");
      setVariants([]);
      setRemovedVariantIds([]);
      setRawMaterialRows([]);
      setRemovedRawMaterialIds([]);
      setFormError(null);
    }
  };

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["products", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["product-items", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["product-raw-materials", restaurantId] });
  };

  const handleSave = async () => {
    if (restaurantId == null || !token) return;
    if (isEdit && !editingProduct) {
      setFormError("Product not found.");
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Name is required.");
      return;
    }
    const vErr = validateVariants();
    if (vErr) {
      setFormError(vErr);
      return;
    }
    const rmErr = validateRawMaterials();
    if (rmErr) {
      setFormError(rmErr);
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editingProduct) {
        if (imageFile) {
          const fd = new FormData();
          fd.append("name", trimmed);
          if (categoryId !== "") fd.append("category", categoryId);
          else fd.append("category", "");
          fd.append("is_veg", isVeg ? "true" : "false");
          fd.append("is_active", isActive ? "true" : "false");
          fd.append("image", imageFile);
          await apiPatchForm(`/api/products/${editingProduct.id}/`, fd, token);
        } else {
          await apiPatch(`/api/products/${editingProduct.id}/`, {
            name: trimmed,
            category: categoryId === "" ? null : Number.parseInt(categoryId, 10),
            is_veg: isVeg,
            is_active: isActive,
          }, token);
        }

        for (const r of variants) {
          if (r.serverId != null) {
            await apiPatch(`/api/product-items/${r.serverId}/`, {
              unit: Number.parseInt(r.unitId, 10),
              price: r.price,
              discount_type: r.discountType,
              discount: r.discount,
            }, token);
          } else {
            await apiPost(
              `/api/product-items/?restaurant_id=${restaurantId}`,
              {
                product: editingProduct.id,
                unit: Number.parseInt(r.unitId, 10),
                price: r.price,
                discount_type: r.discountType,
                discount: r.discount,
              },
              token,
            );
          }
        }
        for (const removedId of removedVariantIds) {
          await apiDelete(`/api/product-items/${removedId}/`, token);
        }

        for (const r of rawMaterialRows) {
          if (!r.rawMaterialId.trim()) continue;
          const body = {
            raw_material: Number.parseInt(r.rawMaterialId, 10),
            raw_material_quantity: r.quantity.trim() === "" ? "0" : r.quantity,
          };
          if (r.serverId != null) {
            await apiPatch(`/api/product-raw-materials/${r.serverId}/`, body, token);
          } else {
            await apiPost(
              `/api/product-raw-materials/?restaurant_id=${restaurantId}`,
              {
                product: editingProduct.id,
                ...body,
              },
              token,
            );
          }
        }
        for (const removedPrmId of removedRawMaterialIds) {
          await apiDelete(`/api/product-raw-materials/${removedPrmId}/`, token);
        }
      } else {
        let created: { id: number };
        if (imageFile) {
          const fd = new FormData();
          fd.append("name", trimmed);
          if (categoryId !== "") fd.append("category", categoryId);
          fd.append("is_veg", isVeg ? "true" : "false");
          fd.append("is_active", isActive ? "true" : "false");
          fd.append("image", imageFile);
          created = await apiPostForm<{ id: number }>(`/api/products/?restaurant_id=${restaurantId}`, fd, token);
        } else {
          created = await apiPost<{ id: number }>(`/api/products/?restaurant_id=${restaurantId}`, {
            name: trimmed,
            category: categoryId === "" ? null : Number.parseInt(categoryId, 10),
            is_veg: isVeg,
            is_active: isActive,
          }, token);
        }
        await persistVariantsForNewProduct(created.id);
        await persistProductRawMaterialsForNewProduct(created.id);
      }
      invalidate();
      goBack();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (restaurantId == null) return <p className="text-sm text-text-muted">No restaurant context.</p>;
  if (isEdit && productsLoading) return <p className="text-sm text-text-muted">Loading…</p>;
  if (isEdit && !editingProduct) {
    if (restaurantIds.length > 1) {
      return (
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="mb-4 font-display text-lg font-semibold text-foreground">Edit product</h2>
            <p className="mb-4 text-sm text-text-muted">
              This product is not in the restaurant you have selected. Choose the location where it belongs.
            </p>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Restaurant</label>
            <select
              value={restaurantId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") return;
                setRestaurantId(Number.parseInt(v, 10));
              }}
              className="h-11 w-full rounded-xl border border-border bg-card px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {restaurantIds.map((rid) => (
                <option key={rid} value={rid}>
                  {restaurants.find((r) => r.id === rid)?.name ?? `Restaurant #${rid}`}
                </option>
              ))}
            </select>
            <div className="mt-6 flex gap-3 border-t border-border pt-4">
              <button
                type="button"
                onClick={goBack}
                className="h-11 flex-1 rounded-xl border border-border text-sm font-semibold text-text-secondary hover:bg-surface"
              >
                Back to products
              </button>
            </div>
          </div>
        </div>
      );
    }
    return <p className="text-sm text-text-muted">Product not found.</p>;
  }

  const existingImageUrl = editingProduct ? resolveMediaUrl(editingProduct.image) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-4 font-display text-lg font-semibold text-foreground">
          {isEdit ? "Edit product" : "Add product"}
        </h2>
        {formError && <p className="mb-3 text-sm text-error">{formError}</p>}

        <div className="space-y-6">
          <section className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Details</p>
            {restaurantIds.length > 1 && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-secondary">Restaurant *</label>
                <select
                  value={restaurantId ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") return;
                    onFormRestaurantChange(Number.parseInt(v, 10));
                  }}
                  className="h-11 w-full rounded-xl border border-border bg-card px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  {restaurantIds.map((rid) => (
                    <option key={rid} value={rid}>
                      {restaurants.find((r) => r.id === rid)?.name ?? `Restaurant #${rid}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Product name"
                className="h-11 w-full rounded-xl border border-border bg-card px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-card px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="">None</option>
                {(categories as { id: number; name: string }[]).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={isVeg}
                  onChange={(e) => setIsVeg(e.target.checked)}
                  className="size-4 rounded border-border"
                />
                Vegetarian
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="size-4 rounded border-border"
                />
                Active (visible on menu)
              </label>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">Image</label>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="flex min-h-[120px] min-w-[140px] flex-1 flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-surface p-2">
                  {imagePreview ? (
                    <img src={imagePreview} alt="" className="max-h-40 w-full rounded-lg object-contain" />
                  ) : existingImageUrl && !imageFile ? (
                    <img src={existingImageUrl} alt="" className="max-h-40 w-full rounded-lg object-contain" />
                  ) : (
                    <span className="text-center text-xs text-text-muted">No image yet</span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                    className="w-full text-sm text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-xs file:font-medium file:text-primary"
                  />
                  {imageFile && (
                    <button
                      type="button"
                      onClick={() => setImageFile(null)}
                      className="self-start text-xs font-medium text-primary hover:underline"
                    >
                      Remove new image
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3 border-t border-border pt-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Variants</p>
              <button
                type="button"
                onClick={() => addVariantRow()}
                disabled={!defaultUnitId}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={14} /> Add variant
              </button>
            </div>
            {!defaultUnitId ? (
              <p className="text-sm text-text-muted">
                Create units first under <span className="font-medium text-foreground">Owner {"->"} Units</span>, then add
                variants here.
              </p>
            ) : (
              <div className="space-y-3">
                {variants.map((r) => (
                  <div
                    key={r.key}
                    className="grid gap-3 rounded-xl border border-border bg-surface/40 p-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end"
                  >
                    <div className="lg:col-span-3">
                      <label className="mb-1 block text-xs font-medium text-text-secondary">Unit</label>
                      <select
                        value={r.unitId}
                        onChange={(e) => updateVariant(r.key, { unitId: e.target.value })}
                        className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"
                      >
                        {unitList.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.symbol} - {u.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="lg:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-text-secondary">Price (Rs)</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={r.price}
                        onChange={(e) => updateVariant(r.key, { price: e.target.value })}
                        className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"
                      />
                    </div>
                    <div className="lg:col-span-3">
                      <label className="mb-1 block text-xs font-medium text-text-secondary">Discount type</label>
                      <select
                        value={r.discountType}
                        onChange={(e) => updateVariant(r.key, { discountType: e.target.value as DiscountKind })}
                        className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"
                      >
                        <option value="flat">Flat (Rs)</option>
                        <option value="percentage">Percentage (%)</option>
                      </select>
                    </div>
                    <div className="lg:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-text-secondary">Discount</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={r.discount}
                        onChange={(e) => updateVariant(r.key, { discount: e.target.value })}
                        className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"
                      />
                    </div>
                    <div className="flex items-end justify-end lg:col-span-2">
                      <button
                        type="button"
                        onClick={() => removeVariant(r)}
                        className="inline-flex h-10 items-center gap-1 rounded-lg border border-border px-3 text-xs font-medium text-error"
                      >
                        <Trash2 size={14} /> Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3 border-t border-border pt-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Recipe (raw materials)</p>
              <button
                type="button"
                onClick={() => addRawMaterialRow()}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-surface"
              >
                <Plus size={14} /> Add ingredient
              </button>
            </div>
            <p className="text-sm text-text-muted">
              Optional. Quantities are per single unit sold (e.g. per plate). They apply to all variants unless you add
              item-specific mappings elsewhere.
            </p>
            {(rawMaterials as { id: number }[]).length === 0 ? (
              <p className="text-sm text-text-muted">
                No raw materials yet. Add them under <span className="font-medium text-foreground">Owner {"->"} Raw materials</span>{" "}
                first.
              </p>
            ) : rawMaterialRows.length === 0 ? (
              <p className="text-sm text-text-muted">No ingredients linked. Use &quot;Add ingredient&quot; to map stock items to this product.</p>
            ) : (
              <div className="space-y-3">
                {rawMaterialRows.map((r) => {
                  const rm = (rawMaterials as { id: number; name: string; unit: number }[]).find(
                    (x) => x.id === Number.parseInt(r.rawMaterialId, 10),
                  );
                  const unitSym = rm != null ? unitList.find((u) => u.id === rm.unit)?.symbol ?? "" : "";
                  return (
                    <div
                      key={r.key}
                      className="grid gap-3 rounded-xl border border-border bg-surface/40 p-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end"
                    >
                      <div className="lg:col-span-5">
                        <label className="mb-1 block text-xs font-medium text-text-secondary">Raw material</label>
                        <select
                          value={r.rawMaterialId}
                          onChange={(e) => updateRawMaterialRow(r.key, { rawMaterialId: e.target.value })}
                          className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"
                        >
                          <option value="">Select…</option>
                          {(rawMaterials as { id: number; name: string }[]).map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="lg:col-span-5">
                        <label className="mb-1 block text-xs font-medium text-text-secondary">
                          Quantity per unit sold{unitSym ? ` (${unitSym})` : ""}
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="0.001"
                          value={r.quantity}
                          onChange={(e) => updateRawMaterialRow(r.key, { quantity: e.target.value })}
                          className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"
                          placeholder="0"
                        />
                      </div>
                      <div className="flex items-end justify-end lg:col-span-2">
                        <button
                          type="button"
                          onClick={() => removeRawMaterialRow(r)}
                          className="inline-flex h-10 items-center gap-1 rounded-lg border border-border px-3 text-xs font-medium text-error"
                        >
                          <Trash2 size={14} /> Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="mt-6 flex gap-3 border-t border-border pt-4">
          <button
            type="button"
            onClick={goBack}
            className="h-11 flex-1 rounded-xl border border-border text-sm font-semibold text-text-secondary hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !defaultUnitId}
            onClick={() => void handleSave()}
            className="h-11 flex-1 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary-600 disabled:opacity-60"
          >
            {saving ? "Saving..." : isEdit ? "Save changes" : "Create product"}
          </button>
        </div>
      </div>
    </div>
  );
}
