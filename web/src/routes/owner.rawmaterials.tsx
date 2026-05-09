import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/shared/DataTable";
import {
  useOwnerRawMaterialsByRestaurant,
  useOwnerSuppliersByRestaurant,
  useOwnerUnitsByRestaurant,
  useRawMaterials,
  useRestaurants,
  useSuppliers,
  useUnits,
} from "@/hooks/use-rest-api";
import { apiDelete, apiPatch, apiPost } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { restaurantTableColumn } from "@/lib/restaurant-table-column";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { Plus, Trash2 } from "lucide-react";

type Rm = {
  id: number;
  name: string;
  supplier: number | null;
  unit: number;
  price: string | number;
  stock: string | number;
  min_stock: string | number;
  restaurant?: number;
  restaurant_name?: string;
};

export const Route = createFileRoute("/owner/rawmaterials")({ component: RawMaterialsPage });

function RawMaterialsPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { restaurantId, restaurantIds, setRestaurantId } = useRestaurantScope();
  const multiRestaurant = restaurantIds.length > 1;
  const showRestaurantCol = multiRestaurant;
  /** Table scope for this page only; default All when the owner has multiple restaurants. */
  const [materialsFilter, setMaterialsFilter] = useState<number | "all">("all");
  const effectiveFilter = useMemo((): number | "all" | null => {
    if (restaurantIds.length === 0) return null;
    if (!multiRestaurant) return restaurantIds[0]!;
    return materialsFilter;
  }, [restaurantIds, multiRestaurant, materialsFilter]);

  const listRestaurantId = effectiveFilter !== "all" && effectiveFilter != null ? effectiveFilter : null;
  const { data: rawMaterialsSingle, isLoading: loadingSingle, error: errorSingle } = useRawMaterials(listRestaurantId);
  const {
    sections: rmSections,
    isPending: loadingAllRm,
    error: errorAllRm,
  } = useOwnerRawMaterialsByRestaurant({
    enabled: Boolean(multiRestaurant && effectiveFilter === "all"),
  });
  const {
    sections: supplierSections,
    isPending: loadingAllSuppliers,
  } = useOwnerSuppliersByRestaurant({
    enabled: Boolean(multiRestaurant && effectiveFilter === "all"),
  });
  const { sections: unitSections, isPending: loadingAllUnits } = useOwnerUnitsByRestaurant({
    enabled: Boolean(multiRestaurant && effectiveFilter === "all"),
  });

  const { data: restaurantsRaw = [] } = useRestaurants();
  const restaurants = restaurantsRaw as { id: number; name: string }[];
  const scopeDescription = useMemo(() => {
    if (effectiveFilter == null) return "";
    if (effectiveFilter === "all") return "all restaurants";
    return restaurants.find((r) => r.id === effectiveFilter)?.name ?? `Restaurant #${effectiveFilter}`;
  }, [effectiveFilter, restaurants]);

  const restaurantOptionsIds = useMemo(() => {
    const ids = new Set(restaurantIds);
    if (restaurantId != null) ids.add(restaurantId);
    return [...ids].sort((a, b) => a - b);
  }, [restaurantIds, restaurantId]);

  const [showForm, setShowForm] = useState(false);
  const [addRestaurantId, setAddRestaurantId] = useState<number | null>(null);
  const [editMat, setEditMat] = useState<Rm | null>(null);

  const formSupplierUnitRestaurantId = useMemo(() => {
    if (!showForm) {
      return typeof effectiveFilter === "number" ? effectiveFilter : restaurantIds[0] ?? null;
    }
    if (editMat) return editMat.restaurant ?? restaurantIds[0] ?? null;
    return addRestaurantId ?? restaurantIds[0] ?? null;
  }, [showForm, editMat, addRestaurantId, effectiveFilter, restaurantIds]);

  const { data: suppliers } = useSuppliers(listRestaurantId);
  const { data: formSuppliers } = useSuppliers(formSupplierUnitRestaurantId);
  const { data: units } = useUnits(listRestaurantId);
  const { data: formUnits } = useUnits(formSupplierUnitRestaurantId);

  const [name, setName] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [minStock, setMinStock] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [listActionError, setListActionError] = useState<string | null>(null);

  const openAdd = () => {
    setListActionError(null);
    setEditMat(null);
    const targetRest = typeof effectiveFilter === "number" ? effectiveFilter : restaurantIds[0] ?? null;
    setAddRestaurantId(targetRest);
    setName("");
    setSupplierId("");
    const uList =
      typeof effectiveFilter === "number" ? (units as { id: number }[] | undefined) : undefined;
    setUnitId(uList?.length ? String(uList[0].id) : "");
    setPrice("");
    setStock("");
    setMinStock("");
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (rm: Rm) => {
    setListActionError(null);
    setEditMat(rm);
    setName(rm.name);
    setSupplierId(rm.supplier != null ? String(rm.supplier) : "");
    setUnitId(String(rm.unit));
    setPrice(String(rm.price));
    setStock(String(rm.stock));
    setMinStock(String(rm.min_stock));
    setFormError(null);
    setShowForm(true);
  };

  const syncRawMaterialsCacheAfterCreate = (restId: number, row: Rm) => {
    queryClient.setQueryData<Rm[]>(["raw-materials", restId, token], (prev) => {
      const list = Array.isArray(prev) ? [...prev] : [];
      if (list.some((r) => r.id === row.id)) return list;
      list.push(row);
      list.sort((a, b) => a.name.localeCompare(b.name));
      return list;
    });
  };

  const syncRawMaterialsCacheAfterUpdate = (restId: number, row: Rm) => {
    queryClient.setQueryData<Rm[]>(["raw-materials", restId, token], (prev) => {
      if (!Array.isArray(prev)) return [row];
      return prev.map((r) => (r.id === row.id ? { ...r, ...row } : r));
    });
  };

  const invalidate = async (materialRestaurantId: number | null) => {
    const ids = new Set<number>();
    if (materialRestaurantId != null) ids.add(materialRestaurantId);
    if (effectiveFilter === "all") {
      for (const rid of restaurantIds) ids.add(rid);
    } else if (typeof effectiveFilter === "number") {
      ids.add(effectiveFilter);
    }
    for (const rid of ids) {
      await queryClient.invalidateQueries({ queryKey: ["raw-materials", rid] });
    }
  };

  useEffect(() => {
    if (!showForm || editMat != null || addRestaurantId == null) return;
    const uList = formUnits as { id: number }[] | undefined;
    if (!uList?.length) return;
    setUnitId((prev) => (prev === "" || !uList.some((u) => String(u.id) === prev) ? String(uList[0].id) : prev));
  }, [formUnits, addRestaurantId, showForm, editMat]);

  const handleSave = async () => {
    if (!token) return;
    if (editMat == null && addRestaurantId == null) {
      setFormError("Select a restaurant.");
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Name is required.");
      return;
    }
    if (!unitId) {
      setFormError("Unit is required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body: Record<string, unknown> = {
        name: trimmed,
        unit: Number.parseInt(unitId, 10),
        price: price === "" ? "0" : price,
        stock: stock === "" ? "0" : stock,
        min_stock: minStock === "" ? "0" : minStock,
      };
      if (supplierId === "") body.supplier = null;
      else body.supplier = Number.parseInt(supplierId, 10);

      if (editMat) {
        const updated = await apiPatch<Rm>(`/api/raw-materials/${editMat.id}/`, body, token);
        const rid = editMat.restaurant ?? restaurantId;
        if (rid != null) syncRawMaterialsCacheAfterUpdate(rid, updated);
        await invalidate(editMat.restaurant ?? restaurantId);
      } else {
        if (addRestaurantId == null) return;
        const created = await apiPost<Rm>(`/api/raw-materials/?restaurant_id=${addRestaurantId}`, body, token);
        syncRawMaterialsCacheAfterCreate(addRestaurantId, created);
        await invalidate(addRestaurantId);
        if (addRestaurantId !== restaurantId) setRestaurantId(addRestaurantId);
      }
      setShowForm(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rm: Rm) => {
    if (!token) return;
    if (!window.confirm(`Delete raw material "${rm.name}"? This cannot be undone.`)) return;
    setListActionError(null);
    setDeletingId(rm.id);
    try {
      await apiDelete(`/api/raw-materials/${rm.id}/`, token);
      await invalidate(rm.restaurant ?? restaurantId);
    } catch (e) {
      setListActionError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  };

  const rows = useMemo(() => {
    if (effectiveFilter === "all") {
      const merged: Rm[] = [];
      for (const s of rmSections) {
        const list = (s.rawMaterials as Rm[] | undefined) ?? [];
        for (const r of list) {
          merged.push({
            ...r,
            restaurant: r.restaurant ?? s.restaurantId,
            restaurant_name: r.restaurant_name ?? restaurants.find((x) => x.id === s.restaurantId)?.name,
          });
        }
      }
      merged.sort((a, b) => a.name.localeCompare(b.name));
      return merged;
    }
    return (rawMaterialsSingle as Rm[] | undefined) ?? [];
  }, [effectiveFilter, rmSections, rawMaterialsSingle, restaurants]);

  const supNameForRow = (rm: Rm) => {
    const id = rm.supplier;
    if (id == null) return "—";
    if (effectiveFilter === "all") {
      const rid = rm.restaurant;
      if (rid == null) return "—";
      const sec = supplierSections.find((s) => s.restaurantId === rid);
      return (sec?.suppliers as { id: number; name: string }[] | undefined)?.find((s) => s.id === id)?.name ?? "—";
    }
    return (suppliers as { id: number; name: string }[] | undefined)?.find((s) => s.id === id)?.name ?? "—";
  };

  const unitSymForRow = (rm: Rm) => {
    const id = rm.unit;
    if (effectiveFilter === "all") {
      const rid = rm.restaurant;
      if (rid == null) return "—";
      const sec = unitSections.find((s) => s.restaurantId === rid);
      return (sec?.units as { id: number; symbol: string; name: string }[] | undefined)?.find((u) => u.id === id)
        ?.symbol ?? "—";
    }
    return (units as { id: number; symbol: string; name: string }[] | undefined)?.find((u) => u.id === id)?.symbol ?? "—";
  };

  const isLoading =
    effectiveFilter == null ||
    (effectiveFilter === "all"
      ? loadingAllRm || loadingAllSuppliers || loadingAllUnits
      : loadingSingle);
  const error = effectiveFilter === "all" ? errorAllRm : errorSingle;

  const supplierOptionsForForm = formSuppliers as { id: number; name: string }[] | undefined;
  const unitOptionsForForm = formUnits as { id: number; name: string; symbol: string }[] | undefined;

  if (restaurantIds.length === 0) return <p className="text-sm text-text-muted">No restaurants assigned.</p>;
  if (effectiveFilter == null) return <p className="text-sm text-text-muted">Loading…</p>;
  if (error) return <p className="text-sm text-error">Failed to load raw materials.</p>;
  if (isLoading) return <p className="text-sm text-text-muted">Loading…</p>;

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4">
        <div>
          <h2 className="font-display font-semibold text-lg text-foreground">Raw Materials</h2>
          {scopeDescription ? (
            <p className="text-sm text-text-muted mt-1">
              Showing inventory for <span className="font-medium text-foreground">{scopeDescription}</span>.
            </p>
          ) : null}
          {listActionError ? <p className="text-sm text-error mt-2">{listActionError}</p> : null}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center shrink-0">
          {multiRestaurant ? (
            <div className="min-w-[200px]">
              <label className="text-xs text-text-secondary block mb-1">Restaurant</label>
              <select
                value={materialsFilter === "all" ? "all" : String(materialsFilter)}
                onChange={(e) => {
                  const v = e.target.value;
                  setMaterialsFilter(v === "all" ? "all" : Number.parseInt(v, 10));
                }}
                className="w-full sm:w-auto min-w-[200px] h-10 px-3 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
              >
                <option value="all">All</option>
                {restaurantIds.map((rid) => (
                  <option key={rid} value={rid}>
                    {restaurants.find((r) => r.id === rid)?.name ?? `Restaurant #${rid}`}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <button
            type="button"
            onClick={openAdd}
            className="h-10 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary-600 flex items-center justify-center gap-1 shrink-0"
          >
            <Plus size={14} /> Add Material
          </button>
        </div>
      </div>
      <DataTable
        columns={[
          { header: "Name", accessor: "name" },
          ...(showRestaurantCol ? [restaurantTableColumn<Rm>()] : []),
          { header: "Supplier", accessor: (rm) => supNameForRow(rm) },
          { header: "Unit", accessor: (rm) => unitSymForRow(rm) },
          { header: "Price", accessor: (rm) => `₹${Number(rm.price).toLocaleString()}` },
          {
            header: "Stock",
            accessor: (rm) => (
              <span
                className={`font-mono font-semibold ${
                  Number(rm.stock) <= Number(rm.min_stock) ? "text-error" : "text-foreground"
                }`}
              >
                {rm.stock}
              </span>
            ),
          },
          { header: "Min Stock", accessor: (rm) => String(rm.min_stock) },
          {
            header: "Actions",
            accessor: (rm) => (
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <Link
                  to="/owner/rawmaterials/$id"
                  params={{ id: String(rm.id) }}
                  className="px-2 py-1 text-xs rounded-lg bg-primary-50 text-primary font-medium hover:bg-primary-100"
                >
                  View
                </Link>
                <button
                  type="button"
                  onClick={() => openEdit(rm)}
                  className="px-2 py-1 text-xs rounded-lg bg-info/10 text-info font-medium hover:bg-info/20"
                >
                  Edit
                </button>
                <button
                  type="button"
                  aria-label={`Delete raw material ${rm.name}`}
                  title="Delete"
                  disabled={deletingId === rm.id}
                  onClick={() => void handleDelete(rm)}
                  className="p-2 rounded-lg text-text-secondary hover:text-error hover:bg-error/10 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={16} strokeWidth={2} />
                </button>
              </div>
            ),
          },
        ]}
        data={rows}
      />

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-display font-semibold text-lg text-foreground mb-4">
              {editMat ? "Edit Raw Material" : "Add Raw Material"}
            </h3>
            {formError && <p className="text-sm text-error mb-3">{formError}</p>}
            <div className="space-y-4">
              {!editMat && (
                <div>
                  <label className="text-sm font-medium text-text-secondary mb-1.5 block">Restaurant *</label>
                  <select
                    value={addRestaurantId ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setAddRestaurantId(v === "" ? null : Number.parseInt(v, 10));
                      setSupplierId("");
                      setUnitId("");
                    }}
                    className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                  >
                    <option value="">Select restaurant…</option>
                    {restaurantOptionsIds.map((rid) => (
                      <option key={rid} value={rid}>
                        {restaurants.find((r) => r.id === rid)?.name ?? `Restaurant #${rid}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block">Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Material name"
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block">Supplier</label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                >
                  <option value="">None</option>
                  {supplierOptionsForForm?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block">Unit *</label>
                <select
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                >
                  <option value="">Select</option>
                  {unitOptionsForForm?.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.symbol})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block">Price</label>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="₹ 0"
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-text-secondary mb-1.5 block">Stock</label>
                  <input
                    type="number"
                    step="0.1"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-text-secondary mb-1.5 block">Min Stock</label>
                  <input
                    type="number"
                    step="0.1"
                    value={minStock}
                    onChange={(e) => setMinStock(e.target.value)}
                    className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 h-11 rounded-xl border border-border text-sm font-semibold text-text-secondary hover:bg-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-600 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
