import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState, type DependencyList } from "react";
import { OwnerEntityCard, ownerListActionClass, ownerListActionDangerClass } from "@/components/owner/OwnerEntityCard";
import { OwnerBulkToolbarButton } from "@/components/owner/owner-list-bulk";
import {
  GroupedListSections,
  ListPageShell,
  ownerEntityCardGridClass,
  PaginatedList,
} from "@/components/shared/PaginatedList";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { useOwnerSuppliersByRestaurant, useRestaurants, useSuppliers } from "@/hooks/use-rest-api";
import { apiDelete, apiPatch, apiPatchForm, apiPost, apiPostForm, resolveMediaUrl } from "@/lib/api";
import { parseLocalPhone } from "@/lib/phone-validation";
import { useAuth } from "@/lib/auth-context";
import { ownerStaffShowsRestaurantColumn, type RestaurantRowExtras } from "@/lib/restaurant-table-column";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { MapPin, Phone, Plus, Truck } from "lucide-react";

export const Route = createFileRoute("/owner/suppliers")({ component: SuppliersPage });

type SupplierRow = RestaurantRowExtras & { id: number; name: string; phone: string; image?: string | null };

function SuppliersPage() {
  const { token, user } = useAuth();
  const qc = useQueryClient();
  const { restaurantId, restaurantIds } = useRestaurantScope();
  const isSuper = user?.portal_role === "superadmin";
  const [showAllRestaurants, setShowAllRestaurants] = useState(false);
  const showAllFlat = Boolean(isSuper && showAllRestaurants);
  const showRestaurantColInTable =
    ownerStaffShowsRestaurantColumn(user) || Boolean(isSuper && showAllRestaurants);

  const flatQuery = useSuppliers(restaurantId, {
    allRestaurants: showAllFlat,
    enabled: showAllFlat,
  });
  const sectionsQuery = useOwnerSuppliersByRestaurant({ enabled: !showAllFlat });

  const { data: flatData = [], isLoading: flatLoading, error: flatError } = flatQuery;
  const { sections, isPending: sectionsPending, error: sectionsError } = sectionsQuery;

  const isLoading = showAllFlat ? flatLoading : sectionsPending;
  const error = showAllFlat ? flatError : sectionsError;

  const { data: restaurantsRaw = [] } = useRestaurants();
  const restaurants = restaurantsRaw as { id: number; name: string }[];

  const restaurantLabel = useCallback(
    (rid: number) => restaurants.find((r) => r.id === rid)?.name ?? `Restaurant #${rid}`,
    [restaurants],
  );

  const restaurantOptionsIds = useMemo(() => {
    const ids = new Set(restaurantIds);
    if (restaurantId != null) ids.add(restaurantId);
    return [...ids].sort((a, b) => a - b);
  }, [restaurantIds, restaurantId]);

  const [showForm, setShowForm] = useState(false);
  const { requestConfirm, ConfirmDialog } = useConfirmAction();
  const [editId, setEditId] = useState<number | null>(null);
  const [addRestaurantId, setAddRestaurantId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const openAdd = () => {
    setEditId(null);
    setAddRestaurantId(restaurantId);
    setName("");
    setPhone("");
    setImageFile(null);
    setExistingImageUrl(null);
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (supplier: Record<string, unknown>) => {
    setEditId(Number(supplier.id));
    setName(String(supplier.name ?? ""));
    setPhone(String(supplier.phone ?? ""));
    setImageFile(null);
    setExistingImageUrl(resolveMediaUrl((supplier.image as string | null | undefined) ?? null));
    setFormError(null);
    setShowForm(true);
  };

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["suppliers"] });
  };

  const handleSave = async () => {
    if (!token) return;
    if (editId == null && addRestaurantId == null) {
      setFormError("Select a restaurant.");
      return;
    }
    if (!name.trim()) {
      setFormError("Supplier name is required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const n = name.trim();
      const pRaw = phone.trim();
      let p = pRaw;
      if (pRaw) {
        const parsed = parseLocalPhone(pRaw);
        if (!parsed.ok) {
          setFormError(parsed.message);
          setSaving(false);
          return;
        }
        p = parsed.digits;
      }
      if (imageFile) {
        const fd = new FormData();
        fd.append("name", n);
        fd.append("phone", p);
        fd.append("image", imageFile);
        if (editId != null) {
          await apiPatchForm(`/api/suppliers/${editId}/`, fd, token);
        } else {
          await apiPostForm(`/api/suppliers/?restaurant_id=${addRestaurantId}`, fd, token);
        }
      } else if (editId != null) {
        await apiPatch(`/api/suppliers/${editId}/`, { name: n, phone: p }, token);
      } else {
        await apiPost(`/api/suppliers/?restaurant_id=${addRestaurantId}`, { name: n, phone: p }, token);
      }
      refresh();
      setShowForm(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save supplier.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: number) => {
    if (!token) return;
    requestConfirm({
      title: "Delete supplier",
      message: "Delete this supplier? This cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
      onConfirm: async () => {
        try {
          await apiDelete(`/api/suppliers/${id}/`, token);
          refresh();
        } catch (e) {
          setFormError(e instanceof Error ? e.message : "Failed to delete supplier.");
        }
      },
    });
  };

  const renderSupplierCards = (list: SupplierRow[], showVenue: boolean, resetDeps: DependencyList) => (
    <PaginatedList
      items={list}
      enablePagination
      enableSelection
      resetDeps={resetDeps}
      stackClassName={ownerEntityCardGridClass}
      empty={<p className="text-sm text-text-muted">No suppliers for this restaurant yet.</p>}
      selectionActions={({ selectedIds, clearSelection }) =>
        selectedIds.length > 0 ? (
          <OwnerBulkToolbarButton
            variant="danger"
            onClick={() => {
              if (!token) return;
              requestConfirm({
                title: "Delete selected suppliers",
                message: `Delete ${selectedIds.length} supplier(s)? This cannot be undone.`,
                confirmLabel: "Delete",
                variant: "danger",
                onConfirm: async () => {
                  try {
                    for (const id of selectedIds) {
                      await apiDelete(`/api/suppliers/${id}/`, token);
                    }
                    refresh();
                    clearSelection();
                  } catch (e) {
                    setFormError(e instanceof Error ? e.message : "Failed to delete suppliers.");
                  }
                },
              });
            }}
          >
            Delete selected ({selectedIds.length})
          </OwnerBulkToolbarButton>
        ) : null
      }
      renderItem={(row, sel) => {
        const url = resolveMediaUrl(row.image);
        const venue = showVenue && row.restaurant != null ? restaurantLabel(row.restaurant) : null;
        return (
          <OwnerEntityCard
            {...(sel.selectable ? sel : {})}
            className="h-full"
            leading={
              url ? (
                <img src={url} alt="" className="h-12 w-12 rounded-xl border border-border object-cover shadow-sm" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Truck strokeWidth={2} aria-hidden />
                </div>
              )
            }
            title={row.name}
            subtitle={
              <span className="inline-flex items-center gap-1.5">
                <Phone size={14} className="shrink-0 text-primary" aria-hidden />
                <span>{row.phone || "—"}</span>
              </span>
            }
            meta={
              venue ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
                  <MapPin size={12} className="shrink-0 text-primary" aria-hidden />
                  {venue}
                </span>
              ) : null
            }
            actions={
              <>
                <button type="button" onClick={() => openEdit(row as unknown as Record<string, unknown>)} className={ownerListActionClass}>
                  Edit
                </button>
                <button type="button" onClick={() => void handleDelete(Number(row.id))} className={ownerListActionDangerClass}>
                  Delete
                </button>
              </>
            }
          />
        );
      }}
    />
  );

  if (restaurantIds.length === 0) return <p className="text-sm text-text-muted">No restaurants assigned.</p>;
  if (error) return <p className="text-sm text-error">Failed to load suppliers.</p>;
  if (isLoading) return <p className="text-sm text-text-muted">Loading…</p>;

  return (
    <>
      <ListPageShell
        header={
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-display font-semibold text-lg text-foreground">Suppliers</h2>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              {isSuper && (
                <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showAllRestaurants}
                    onChange={(e) => setShowAllRestaurants(e.target.checked)}
                    className="rounded border-border"
                  />
                  All restaurants
                </label>
              )}
              <button
                type="button"
                onClick={openAdd}
                className="h-10 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center gap-1"
              >
                <Plus size={14} /> Add Supplier
              </button>
            </div>
          </div>
        }
      >
        {showAllFlat ? (
          renderSupplierCards(flatData as SupplierRow[], showRestaurantColInTable && showAllFlat, [showAllRestaurants])
        ) : restaurantIds.length > 1 ? (
          <GroupedListSections
            sections={sections.map(({ restaurantId: rid, suppliers }) => ({
              key: rid,
              title: restaurantLabel(rid),
              children:
                (suppliers as SupplierRow[]).length === 0 ? (
                  <p className="text-sm text-text-muted">No suppliers for this restaurant yet.</p>
                ) : (
                  renderSupplierCards(suppliers as SupplierRow[], false, [rid])
                ),
            }))}
          />
        ) : (sections[0]?.suppliers as SupplierRow[] | undefined)?.length === 0 ? (
          <p className="text-sm text-text-muted">No suppliers for this restaurant yet.</p>
        ) : (
          renderSupplierCards((sections[0]?.suppliers as SupplierRow[]) ?? [], false, [restaurantIds])
        )}
      </ListPageShell>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md max-h-[min(92dvh,calc(100vh-2rem))] overflow-y-auto overscroll-contain shadow-xl">
            <h3 className="font-display font-semibold text-lg text-foreground mb-4">
              {editId == null ? "Add Supplier" : "Edit Supplier"}
            </h3>
            {formError && <p className="text-sm text-error mb-3">{formError}</p>}
            <div className="space-y-3">
              {editId == null && (
                <div>
                  <label className="text-sm font-medium text-text-secondary mb-1.5 block">Restaurant *</label>
                  <select
                    value={addRestaurantId ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setAddRestaurantId(v === "" ? null : Number.parseInt(v, 10));
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
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Supplier name"
                className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone (optional)"
                className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm"
              />
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block">Photo (optional)</label>
                {existingImageUrl && !imageFile ? (
                  <div className="mb-2">
                    <img
                      src={existingImageUrl}
                      alt=""
                      className="h-20 w-28 rounded-lg object-cover border border-border bg-surface"
                    />
                  </div>
                ) : null}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                  className="w-full text-sm text-text-secondary file:mr-3 file:rounded-lg file:border-0 file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 h-11 rounded-xl border border-border text-sm font-semibold text-text-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
      {ConfirmDialog}
    </>
  );
}
