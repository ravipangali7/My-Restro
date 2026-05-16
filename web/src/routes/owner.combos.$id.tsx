import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { useComboSets, useProductItems, useProducts, useRestaurants } from "@/hooks/use-rest-api";
import { apiDelete, apiPatch, apiPatchForm, apiPost, apiPostForm, resolveMediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { restaurantDisplayName, type RestaurantRowExtras } from "@/lib/restaurant-table-column";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { money } from "@/lib/money";
import { ImagePlus } from "lucide-react";

export const Route = createFileRoute("/owner/combos/$id")({ component: ComboDetail });

interface ComboRow {
  id: number;
  restaurant?: number;
  products?: number[];
  name?: string;
  description?: string;
  discount_type?: string;
  discount?: string | number;
  is_active?: boolean;
  image?: string | null;
}

function ComboDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { restaurantId, restaurantIds, setRestaurantId } = useRestaurantScope();
  const { data: restaurantsRaw = [] } = useRestaurants();
  const restaurants = restaurantsRaw as { id: number; name: string }[];
  const { data: combos = [] } = useComboSets(restaurantId);
  const [formRestaurantId, setFormRestaurantId] = useState<number | null>(null);
  const ridForQueries = formRestaurantId ?? restaurantId ?? restaurantIds[0] ?? null;
  const { data: products = [] } = useProducts(ridForQueries);
  const { data: productItems = [] } = useProductItems(ridForQueries);
  const isCreate = id === "new";
  const c = useMemo(() => (combos as ComboRow[]).find((x) => String(x.id) === id), [combos, id]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [discountType, setDiscountType] = useState<"flat" | "percentage">("flat");
  const [discount, setDiscount] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { requestConfirm, ConfirmDialog } = useConfirmAction();

  useEffect(() => {
    if (isCreate) {
      setName("");
      setDescription("");
      setSelectedProducts([]);
      setDiscountType("flat");
      setDiscount("0");
      setIsActive(true);
      setImageFile(null);
      setFormError(null);
      return;
    }
    if (!c) return;
    setName(c.name ?? "");
    setDescription(c.description ?? "");
    setSelectedProducts((c.products ?? []) as number[]);
    setDiscountType(c.discount_type === "percentage" ? "percentage" : "flat");
    setDiscount(String(c.discount ?? 0));
    setIsActive(Boolean(c.is_active));
    setImageFile(null);
    setFormError(null);
  }, [isCreate, c]);

  useEffect(() => {
    if (isCreate) {
      setFormRestaurantId(restaurantId ?? restaurantIds[0] ?? null);
      return;
    }
    if (c && typeof c.restaurant === "number") {
      setFormRestaurantId(c.restaurant);
    }
  }, [isCreate, id, restaurantId, restaurantIds, c?.restaurant]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(imageFile);
    setImagePreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  const productMinPrice = useMemo(() => {
    const map = new Map<number, number>();
    for (const pi of productItems as { product: number; price: number | string; discount_type: string; discount: number | string }[]) {
      const base = Number(pi.price);
      const d = Number(pi.discount);
      const effective = pi.discount_type === "percentage" ? Math.max(0, base - (base * d) / 100) : Math.max(0, base - d);
      const current = map.get(pi.product);
      if (current == null || effective < current) map.set(pi.product, effective);
    }
    return map;
  }, [productItems]);

  const totalProductPrice = useMemo(
    () => selectedProducts.reduce((sum, pid) => sum + (productMinPrice.get(pid) ?? 0), 0),
    [selectedProducts, productMinPrice],
  );
  const discountNumber = Number(discount || 0);
  const effectiveDiscount =
    discountType === "percentage"
      ? Math.max(0, Math.min(100, discountNumber)) * totalProductPrice / 100
      : Math.max(0, discountNumber);
  const finalPrice = Math.max(0, totalProductPrice - effectiveDiscount);

  const toggleProduct = (productId: number) => {
    setSelectedProducts((current) =>
      current.includes(productId) ? current.filter((idValue) => idValue !== productId) : [...current, productId],
    );
  };

  const existingImage = !isCreate && c ? resolveMediaUrl((c as { image?: string | null }).image) : null;

  const save = async () => {
    const targetRestaurantId = formRestaurantId ?? restaurantId ?? restaurantIds[0] ?? null;
    if (targetRestaurantId == null || !token) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError("Name is required.");
      return;
    }
    const parsedDiscount = Number(discount);
    if (!Number.isFinite(parsedDiscount) || parsedDiscount < 0) {
      setFormError("Discount must be a valid non-negative number.");
      return;
    }
    if (discountType === "percentage" && parsedDiscount > 100) {
      setFormError("Percentage discount cannot exceed 100.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (isCreate) {
        if (imageFile) {
          const fd = new FormData();
          fd.append("name", trimmedName);
          fd.append("description", description.trim());
          fd.append("discount_type", discountType);
          fd.append("discount", String(parsedDiscount));
          fd.append("products", JSON.stringify(selectedProducts));
          fd.append("image", imageFile);
          await apiPostForm(`/api/combo-sets/?restaurant_id=${targetRestaurantId}`, fd, token);
        } else {
          await apiPost(`/api/combo-sets/?restaurant_id=${targetRestaurantId}`, {
            name: trimmedName,
            description: description.trim(),
            discount_type: discountType,
            discount: parsedDiscount,
            products: selectedProducts,
          }, token);
        }
      } else if (c) {
        if (imageFile) {
          const fd = new FormData();
          fd.append("name", trimmedName);
          fd.append("description", description.trim());
          fd.append("discount_type", discountType);
          fd.append("discount", String(parsedDiscount));
          fd.append("products", JSON.stringify(selectedProducts));
          fd.append("is_active", isActive ? "true" : "false");
          fd.append("restaurant_id", String(targetRestaurantId));
          fd.append("image", imageFile);
          await apiPatchForm(`/api/combo-sets/${c.id}/`, fd, token);
        } else {
          await apiPatch(`/api/combo-sets/${c.id}/`, {
            name: trimmedName,
            description: description.trim(),
            discount_type: discountType,
            discount: parsedDiscount,
            products: selectedProducts,
            is_active: isActive,
            restaurant_id: targetRestaurantId,
          }, token);
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["combo-sets"] });
      await navigate({ to: "/owner/combos" });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (ridForQueries == null) {
    return <p className="text-sm text-text-muted">No restaurant context.</p>;
  }

  if (!isCreate && !c) {
    if (restaurantIds.length > 1) {
      return (
        <div className="mx-auto w-full max-w-4xl rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-2 font-display text-xl font-semibold text-foreground">Edit combo set</h2>
          <p className="mb-4 text-sm text-text-muted">
            This combo is not in the restaurant you have selected in the header. Choose the location where it belongs.
          </p>
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">Restaurant</label>
          <select
            value={restaurantId ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") return;
              setRestaurantId(Number.parseInt(v, 10));
            }}
            className="h-11 w-full max-w-md rounded-xl border border-border bg-card px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            {restaurantIds.map((rid) => (
              <option key={rid} value={rid}>
                {restaurants.find((r) => r.id === rid)?.name ?? `Restaurant #${rid}`}
              </option>
            ))}
          </select>
          <div className="mt-6">
            <Link
              to="/owner/combos"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-text-secondary hover:bg-surface"
            >
              Back to combos
            </Link>
          </div>
        </div>
      );
    }
    return <p className="text-sm text-destructive">Not found.</p>;
  }

  const selectedRestaurantId = formRestaurantId ?? restaurantId ?? restaurantIds[0] ?? null;

  return (
    <div className="mx-auto w-full max-w-4xl rounded-2xl border border-border bg-card p-6">
      <h2 className="mb-1 font-display text-xl font-semibold text-foreground">
        {isCreate ? "Add Combo Set" : "Edit Combo Set"}
      </h2>
      <p className="mb-6 text-sm text-text-muted">
        Select products, set a discount, and the final combo price is calculated automatically.
      </p>
      {formError && <p className="mb-4 text-sm text-error">{formError}</p>}
      <div className="mb-4">
        {restaurantIds.length > 1 ? (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Restaurant *</label>
            <select
              value={selectedRestaurantId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") return;
                const nextId = Number.parseInt(v, 10);
                if (Number.isNaN(nextId)) return;
                if (nextId !== selectedRestaurantId) {
                  setSelectedProducts([]);
                }
                setFormRestaurantId(nextId);
                if (isCreate) setRestaurantId(nextId);
              }}
              className="h-11 w-full max-w-md rounded-xl border border-border bg-card px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {restaurantIds.map((rid) => (
                <option key={rid} value={rid}>
                  {restaurants.find((r) => r.id === rid)?.name ?? `Restaurant #${rid}`}
                </option>
              ))}
            </select>
          </div>
        ) : !isCreate && c ? (
          <p className="text-sm text-text-secondary">
            Restaurant:{" "}
            <span className="font-medium text-foreground">{restaurantDisplayName(c as RestaurantRowExtras)}</span>
          </p>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">Combo Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-card px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        {!isCreate && (
          <label className="mt-7 inline-flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="size-4 rounded border-border"
            />
            Active
          </label>
        )}
      </div>
      <div className="mt-4">
        <label className="mb-1.5 block text-sm font-medium text-text-secondary">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="min-h-20 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div className="mt-4">
        <label className="mb-1.5 block text-sm font-medium text-text-secondary">Combo Image</label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex min-h-[120px] min-w-[140px] flex-1 flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-surface p-2">
            {imagePreview ? (
              <img src={imagePreview} alt="" className="max-h-40 w-full rounded-lg object-contain" />
            ) : existingImage ? (
              <img src={existingImage} alt="" className="max-h-40 w-full rounded-lg object-contain" />
            ) : (
              <div className="flex items-center gap-2 text-xs text-text-muted"><ImagePlus size={14} /> No image</div>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-xs file:font-medium file:text-primary"
            />
          </div>
        </div>
      </div>

      <div className="mt-6">
        <label className="mb-2 block text-sm font-medium text-text-secondary">Products</label>
        <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-border p-3">
          {(products as { id: number; name: string; image?: string | null }[]).map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/60 p-2">
              <input
                type="checkbox"
                checked={selectedProducts.includes(p.id)}
                onChange={() => toggleProduct(p.id)}
                className="size-4 rounded border-border"
              />
              {resolveMediaUrl(p.image) ? (
                <img src={resolveMediaUrl(p.image)!} alt="" className="size-10 rounded-lg border border-border object-cover" />
              ) : (
                <div className="flex size-10 items-center justify-center rounded-lg border border-dashed border-border text-text-muted">
                  <ImagePlus size={12} />
                </div>
              )}
              <div className="flex-1">
                <p className="text-sm text-foreground">{p.name}</p>
                <p className="text-xs text-text-muted">
                  Base from {money(productMinPrice.get(p.id) ?? 0)}
                </p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">Offer Type</label>
          <select
            value={discountType}
            onChange={(e) => setDiscountType(e.target.value as "flat" | "percentage")}
            className="h-11 w-full rounded-xl border border-border bg-card px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="flat">Flat (₹)</option>
            <option value="percentage">Percentage (%)</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">Offer Value</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-card px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">Total product price</span>
          <span className="font-semibold text-foreground">{money(totalProductPrice)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-text-secondary">Discount</span>
          <span className="font-semibold text-foreground">- {money(effectiveDiscount)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
          <span className="font-medium text-foreground">Final combo price</span>
          <span className="text-lg font-bold text-primary">{money(finalPrice)}</span>
        </div>
      </div>

      {!isCreate && c ? (
        <div className="mt-6">
          <button
            type="button"
            disabled={deleting || !token}
            onClick={() => {
              if (!token) return;
              const scopeRid = c.restaurant ?? restaurantId ?? restaurantIds[0];
              if (scopeRid == null) return;
              requestConfirm({
                title: "Delete combo set",
                message: "Delete this combo set? This cannot be undone.",
                confirmLabel: "Delete",
                variant: "danger",
                onConfirm: async () => {
                  setDeleting(true);
                  try {
                    await apiDelete(`/api/combo-sets/${c.id}/`, token);
                    void queryClient.invalidateQueries({ queryKey: ["combo-sets", scopeRid] });
                    void navigate({ to: "/owner/combos" });
                  } finally {
                    setDeleting(false);
                  }
                },
              });
            }}
            className="text-sm font-semibold text-error hover:underline disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete combo set"}
          </button>
        </div>
      ) : null}

      <div className="mt-6 flex gap-3">
        <Link
          to="/owner/combos"
          className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-border text-sm font-semibold text-text-secondary hover:bg-surface"
        >
          Cancel
        </Link>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="h-11 flex-1 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary-600 disabled:opacity-60"
        >
          {saving ? "Saving..." : isCreate ? "Create Combo" : "Save Changes"}
        </button>
      </div>
      {ConfirmDialog}
    </div>
  );
}
