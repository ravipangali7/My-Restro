import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState, type DependencyList } from "react";
import { OwnerEntityCard, ownerListActionClass, ownerListActionDangerClass } from "@/components/owner/OwnerEntityCard";
import {
  GroupedListSections,
  ListPageShell,
  ownerEntityCardGridClass,
  PaginatedList,
} from "@/components/shared/PaginatedList";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { useOwnerUnitsByRestaurant, useRestaurants } from "@/hooks/use-rest-api";
import { apiDelete, apiPatch, apiPost } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { RestaurantRowExtras } from "@/lib/restaurant-table-column";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { MapPin, Plus, Ruler } from "lucide-react";

export const Route = createFileRoute("/owner/units")({ component: UnitsPage });

type UnitRow = RestaurantRowExtras & { id: number; name: string; symbol: string };

function UnitsPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { restaurantId, restaurantIds } = useRestaurantScope();
  const { sections, isPending, error } = useOwnerUnitsByRestaurant();
  const { data: restaurantsRaw = [] } = useRestaurants();
  const restaurants = restaurantsRaw as { id: number; name: string }[];

  const restaurantLabel = (rid: number) => restaurants.find((r) => r.id === rid)?.name ?? `Restaurant #${rid}`;

  const restaurantOptionsIds = useMemo(() => {
    const ids = new Set(restaurantIds);
    if (restaurantId != null) ids.add(restaurantId);
    return [...ids].sort((a, b) => a - b);
  }, [restaurantIds, restaurantId]);

  const [showForm, setShowForm] = useState(false);
  const [addRestaurantId, setAddRestaurantId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editUnit, setEditUnit] = useState<UnitRow | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [listActionError, setListActionError] = useState<string | null>(null);
  const { requestConfirm, ConfirmDialog } = useConfirmAction();

  const invalidateUnitQueries = useCallback(async () => {
    const ridSet = new Set<number>(restaurantIds);
    if (restaurantId != null) ridSet.add(restaurantId);
    for (const rid of ridSet) {
      await queryClient.invalidateQueries({ queryKey: ["units", rid] });
    }
  }, [queryClient, restaurantIds, restaurantId]);

  const syncUnitsCacheAfterCreate = (restId: number, row: UnitRow) => {
    queryClient.setQueryData<UnitRow[]>(["units", restId, token], (prev) => {
      const list = Array.isArray(prev) ? prev.filter((u) => u.restaurant == null || u.restaurant === restId) : [];
      const next = [...list];
      if (next.some((u) => u.id === row.id)) return next;
      next.push(row);
      next.sort((a, b) => a.name.localeCompare(b.name));
      return next;
    });
  };

  const openAdd = () => {
    setListActionError(null);
    setEditUnit(null);
    setAddRestaurantId(restaurantId);
    setName("");
    setSymbol("");
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = useCallback((u: UnitRow) => {
    setListActionError(null);
    setEditUnit(u);
    setAddRestaurantId(u.restaurant ?? restaurantId ?? restaurantIds[0] ?? null);
    setName(u.name);
    setSymbol(u.symbol);
    setFormError(null);
    setShowForm(true);
  }, [restaurantId, restaurantIds]);

  const handleDelete = useCallback(
    (u: UnitRow) => {
      if (!token) return;
      requestConfirm({
        title: "Delete unit",
        message: `Delete unit "${u.name}" (${u.symbol})? This cannot be undone.`,
        confirmLabel: "Delete",
        variant: "danger",
        onConfirm: async () => {
          setListActionError(null);
          setDeletingId(u.id);
          try {
            await apiDelete(`/api/units/${u.id}/`, token);
            await invalidateUnitQueries();
          } catch (e) {
            setListActionError(e instanceof Error ? e.message : "Delete failed.");
          } finally {
            setDeletingId(null);
          }
        },
      });
    },
    [token, invalidateUnitQueries, requestConfirm],
  );

  const handleSave = async () => {
    if (!token) return;
    if (addRestaurantId == null) {
      setFormError("Select a restaurant.");
      return;
    }
    const n = name.trim();
    const s = symbol.trim();
    if (!n) {
      setFormError("Name is required.");
      return;
    }
    if (!s) {
      setFormError("Symbol is required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editUnit) {
        await apiPatch<UnitRow>(`/api/units/${editUnit.id}/`, { name: n, symbol: s }, token);
        await invalidateUnitQueries();
      } else {
        const created = await apiPost<UnitRow>(
          `/api/units/?restaurant_id=${addRestaurantId}`,
          { name: n, symbol: s },
          token,
        );
        syncUnitsCacheAfterCreate(addRestaurantId, created);
        await invalidateUnitQueries();
      }
      setShowForm(false);
      setEditUnit(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const renderUnitCards = (list: UnitRow[], resetDeps: DependencyList) => (
    <PaginatedList
      items={list}
      resetDeps={resetDeps}
      stackClassName={ownerEntityCardGridClass}
      empty={<p className="text-sm text-text-muted">No units for this restaurant yet.</p>}
      renderItem={(u, sel) => (
        <OwnerEntityCard
          {...(sel.selectable ? sel : {})}
          className="h-full"
          leading={
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Ruler strokeWidth={2} aria-hidden />
            </div>
          }
          title={u.name}
          subtitle={
            <span className="font-mono text-sm text-text-secondary">
              Symbol: <span className="font-semibold text-foreground">{u.symbol}</span>
            </span>
          }
          meta={
            restaurantIds.length > 1 && u.restaurant != null ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
                <MapPin size={12} className="shrink-0 text-primary" aria-hidden />
                {restaurantLabel(u.restaurant)}
              </span>
            ) : null
          }
          actions={
            <>
              <button type="button" onClick={() => openEdit(u)} className={ownerListActionClass}>
                Edit
              </button>
              <button
                type="button"
                disabled={deletingId === u.id}
                onClick={() => void handleDelete(u)}
                className={ownerListActionDangerClass}
              >
                {deletingId === u.id ? "Deleting…" : "Delete"}
              </button>
            </>
          }
        />
      )}
    />
  );

  if (restaurantIds.length === 0) {
    return <p className="text-sm text-text-muted">No restaurants assigned.</p>;
  }
  if (error) return <p className="text-sm text-error">Failed to load units.</p>;
  if (isPending) return <p className="text-sm text-text-muted">Loading…</p>;

  return (
    <>
      <ListPageShell
        header={
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display font-semibold text-lg text-foreground">Units</h2>
              {listActionError && <p className="text-sm text-error mt-1">{listActionError}</p>}
            </div>
            <button
              type="button"
              onClick={openAdd}
              className="h-10 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary-600 flex items-center gap-1"
            >
              <Plus size={14} /> Add Unit
            </button>
          </div>
        }
      >
        {restaurantIds.length > 1 ? (
          <GroupedListSections
            sections={sections.map(({ restaurantId: rid, units }) => ({
              key: rid,
              title: restaurantLabel(rid),
              children:
                (units as UnitRow[]).length === 0 ? (
                  <p className="text-sm text-text-muted">No units for this restaurant yet.</p>
                ) : (
                  renderUnitCards(units as UnitRow[], [rid])
                ),
            }))}
          />
        ) : (sections[0]?.units as UnitRow[] | undefined)?.length === 0 ? (
          <p className="text-sm text-text-muted">No units for this restaurant yet.</p>
        ) : (
          renderUnitCards((sections[0]?.units as UnitRow[]) ?? [], [restaurantIds, restaurantId])
        )}
      </ListPageShell>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md max-h-[min(92dvh,calc(100vh-2rem))] overflow-y-auto overscroll-contain shadow-xl">
            <h3 className="font-display font-semibold text-lg text-foreground mb-4">{editUnit ? "Edit unit" : "Add unit"}</h3>
            {formError && <p className="text-sm text-error mb-3">{formError}</p>}
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block">Restaurant *</label>
                <select
                  value={addRestaurantId ?? ""}
                  disabled={editUnit != null}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAddRestaurantId(v === "" ? null : Number.parseInt(v, 10));
                  }}
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="">Select restaurant…</option>
                  {restaurantOptionsIds.map((rid) => (
                    <option key={rid} value={rid}>
                      {restaurants.find((r) => r.id === rid)?.name ?? `Restaurant #${rid}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block">Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Kilogram"
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block">Symbol *</label>
                <input
                  type="text"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  placeholder="e.g. kg"
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditUnit(null);
                }}
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
      {ConfirmDialog}
    </>
  );
}
