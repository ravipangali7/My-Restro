import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useQueries } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useCategories, useRestaurants } from "@/hooks/use-rest-api";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { apiDelete, apiGet, apiPatch, apiPatchForm, apiPost, apiPostForm, resolveMediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { cn } from "@/lib/utils";
import { Check, CornerDownRight, Eye, Folder, LayoutGrid, List, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/owner/categories")({
  component: CategoriesPage,
});

interface CatRow {
  id: number;
  name: string;
  parent: number | null;
  restaurant: number;
  restaurant_name?: string;
  image?: string | null;
}

type CategoryDialog = { kind: "edit"; cat: CatRow } | { kind: "add" };

/** Top-level vs nested (child) placement in the category tree. */
type CategoryPlacement = "top" | "nested";

type ViewMode = "list" | "grid";

function sortCategoriesByName(a: CatRow, b: CatRow) {
  return a.name.localeCompare(b.name);
}

function collectDescendantIds(rootId: number, childrenByParent: Map<number, CatRow[]>): Set<number> {
  const out = new Set<number>();
  const walk = (id: number) => {
    for (const ch of childrenByParent.get(id) ?? []) {
      out.add(ch.id);
      walk(ch.id);
    }
  };
  walk(rootId);
  return out;
}

function buildChildrenByParent(categories: CatRow[]) {
  const idSet = new Set(categories.map((c) => c.id));
  const childrenByParent = new Map<number, CatRow[]>();
  for (const c of categories) {
    if (c.parent === null || !idSet.has(c.parent)) continue;
    const list = childrenByParent.get(c.parent);
    if (list) list.push(c);
    else childrenByParent.set(c.parent, [c]);
  }
  for (const list of childrenByParent.values()) list.sort(sortCategoriesByName);
  return childrenByParent;
}

/** Flatten tree depth-first for indented parent dropdown labels. */
function flattenCategoryTreeForSelect(categories: CatRow[]): { id: number; label: string }[] {
  const idSet = new Set(categories.map((c) => c.id));
  const roots = categories.filter((c) => c.parent === null || !idSet.has(c.parent)).sort(sortCategoriesByName);
  const childrenByParent = buildChildrenByParent(categories);
  const out: { id: number; label: string }[] = [];
  const walk = (id: number, depth: number) => {
    const row = categories.find((c) => c.id === id);
    if (!row) return;
    const prefix = depth > 0 ? `${"— ".repeat(depth)}` : "";
    out.push({ id: row.id, label: `${prefix}${row.name}` });
    const kids = childrenByParent.get(id) ?? [];
    for (const k of kids) walk(k.id, depth + 1);
  };
  for (const r of roots) walk(r.id, 0);
  return out;
}

function CategoryGridHero({ image }: { image?: string | null }) {
  const imgUrl = resolveMediaUrl(image);
  if (!imgUrl) return null;
  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-border/60 bg-surface">
      <img src={imgUrl} alt="" className="aspect-[4/3] w-full object-cover" />
    </div>
  );
}

function categoryRestaurantLabel(c: CatRow, restaurantNameById: Map<number, string>) {
  return c.restaurant_name ?? restaurantNameById.get(c.restaurant) ?? `Restaurant #${c.restaurant}`;
}

interface CategoriesForRestaurantProps {
  categories: CatRow[];
  viewMode: ViewMode;
  showRestaurantSubtext: boolean;
  restaurantNameById: Map<number, string>;
  renderCategoryActions: (c: CatRow) => ReactNode;
}

function CategoriesForRestaurant({
  categories,
  viewMode,
  showRestaurantSubtext,
  restaurantNameById,
  renderCategoryActions,
}: CategoriesForRestaurantProps) {
  const { roots, breakouts, childrenByParent } = useMemo(() => {
    const idSet = new Set(categories.map((c) => c.id));
    const roots = categories.filter((c) => c.parent === null).sort(sortCategoriesByName);
    const breakouts = categories
      .filter((c) => c.parent !== null && !idSet.has(c.parent))
      .sort(sortCategoriesByName);
    const childrenByParent = new Map<number, CatRow[]>();
    for (const c of categories) {
      if (c.parent === null || !idSet.has(c.parent)) continue;
      const list = childrenByParent.get(c.parent);
      if (list) list.push(c);
      else childrenByParent.set(c.parent, [c]);
    }
    for (const list of childrenByParent.values()) list.sort(sortCategoriesByName);
    return { roots, breakouts, childrenByParent };
  }, [categories]);

  const renderListDescendants = (parentId: number, depth: number): ReactNode => {
    const kids = childrenByParent.get(parentId) ?? [];
    return kids.map((child) => (
      <div key={child.id}>
        <div
          className="flex items-center justify-between gap-3 border-t border-border/70 bg-surface/40 py-2.5 pr-4"
          style={{ paddingLeft: 16 + depth * 20 }}
        >
          <div className="flex min-w-0 flex-col gap-0.5 text-sm">
            <div className="flex items-center gap-2">
              <CornerDownRight className="size-4 shrink-0 text-text-muted" aria-hidden />
              <span className="truncate text-foreground">{child.name}</span>
            </div>
            {showRestaurantSubtext ? (
              <span className="truncate pl-6 text-xs text-text-muted">
                {categoryRestaurantLabel(child, restaurantNameById)}
              </span>
            ) : null}
          </div>
          {renderCategoryActions(child)}
        </div>
        {renderListDescendants(child.id, depth + 1)}
      </div>
    ));
  };

  const renderGridNested = (parentId: number, nestedLevel: number): ReactNode => {
    const kids = childrenByParent.get(parentId) ?? [];
    if (kids.length === 0) return null;
    return (
      <ul
        className={
          nestedLevel === 0
            ? "mt-3 space-y-2 border-t border-border pt-3"
            : "mt-1.5 space-y-1 border-l border-border pl-3"
        }
      >
        {kids.map((k) => (
          <li key={k.id}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm text-text-secondary">{k.name}</span>
                {showRestaurantSubtext ? (
                  <span className="block truncate text-xs text-text-muted">
                    {categoryRestaurantLabel(k, restaurantNameById)}
                  </span>
                ) : null}
              </div>
              {renderCategoryActions(k)}
            </div>
            {renderGridNested(k.id, nestedLevel + 1)}
          </li>
        ))}
      </ul>
    );
  };

  if (categories.length === 0) {
    return <p className="text-sm text-text-muted">No categories yet for this restaurant.</p>;
  }

  if (viewMode === "list") {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {roots.map((parent) => (
          <div key={parent.id} className="border-b border-border last:border-b-0">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <Folder className="size-[1.125rem] shrink-0 text-primary" aria-hidden />
                  <span className="truncate font-medium text-foreground">{parent.name}</span>
                </div>
                {showRestaurantSubtext ? (
                  <span className="truncate pl-7 text-xs text-text-muted">
                    {categoryRestaurantLabel(parent, restaurantNameById)}
                  </span>
                ) : null}
              </div>
              {renderCategoryActions(parent)}
            </div>
            {renderListDescendants(parent.id, 1)}
          </div>
        ))}
        {breakouts.length > 0 && (
          <div className="border-t-2 border-dashed border-border bg-surface/30">
            <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Other categories
            </div>
            {breakouts.map((row) => (
              <div key={row.id} className="border-b border-border last:border-b-0">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <Folder className="size-[1.125rem] shrink-0 text-text-muted" aria-hidden />
                      <span className="truncate font-medium text-foreground">{row.name}</span>
                    </div>
                    {showRestaurantSubtext ? (
                      <span className="truncate pl-7 text-xs text-text-muted">
                        {categoryRestaurantLabel(row, restaurantNameById)}
                      </span>
                    ) : null}
                  </div>
                  {renderCategoryActions(row)}
                </div>
                {renderListDescendants(row.id, 1)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {roots.map((parent) => (
        <div
          key={parent.id}
          className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <CategoryGridHero image={parent.image} />
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Folder className="size-5 shrink-0 text-primary" aria-hidden />
                <h3 className="truncate font-display font-semibold text-foreground">{parent.name}</h3>
              </div>
              {showRestaurantSubtext ? (
                <p className="mt-0.5 truncate pl-7 text-xs text-text-muted">
                  {categoryRestaurantLabel(parent, restaurantNameById)}
                </p>
              ) : null}
            </div>
            {renderCategoryActions(parent)}
          </div>
          {childrenByParent.get(parent.id)?.length ? (
            renderGridNested(parent.id, 0)
          ) : (
            <p className="mt-3 border-t border-border pt-3 text-xs text-text-muted">No subcategories</p>
          )}
        </div>
      ))}
      {breakouts.length > 0 && (
        <div className="flex flex-col rounded-xl border-2 border-dashed border-border bg-surface/20 p-4 sm:col-span-2 xl:col-span-3">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">Other categories</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {breakouts.map((row) => (
              <div key={row.id} className="rounded-xl border border-border bg-card p-4">
                <CategoryGridHero image={row.image} />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Folder className="size-5 shrink-0 text-text-muted" aria-hidden />
                      <h3 className="truncate font-semibold text-foreground">{row.name}</h3>
                    </div>
                    {showRestaurantSubtext ? (
                      <p className="mt-0.5 truncate pl-7 text-xs text-text-muted">
                        {categoryRestaurantLabel(row, restaurantNameById)}
                      </p>
                    ) : null}
                  </div>
                  {renderCategoryActions(row)}
                </div>
                {childrenByParent.get(row.id)?.length ? (
                  renderGridNested(row.id, 0)
                ) : (
                  <p className="mt-3 border-t border-border pt-3 text-xs text-text-muted">No subcategories</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CategoriesPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { restaurantId, restaurantIds } = useRestaurantScope();

  const fetchIds = useMemo(() => {
    if (restaurantIds.length > 0) return [...restaurantIds].sort((a, b) => a - b);
    if (restaurantId != null) return [restaurantId];
    return [];
  }, [restaurantIds, restaurantId]);

  const { data: restaurantsRaw = [] } = useRestaurants();
  const restaurants = restaurantsRaw as { id: number; name: string }[];

  const restaurantNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of restaurants) m.set(r.id, r.name);
    return m;
  }, [restaurants]);

  const categoryQueries = useQueries({
    queries: useMemo(
      () =>
        fetchIds.map((rid) => ({
          queryKey: ["categories", rid, token] as const,
          queryFn: () => apiGet<unknown[]>(`/api/categories/?restaurant_id=${rid}`, token),
          enabled: Boolean(token && fetchIds.length),
        })),
      [fetchIds, token],
    ),
  });

  const isLoading = fetchIds.length > 0 && categoryQueries.some((q) => q.isPending);
  const loadError = categoryQueries.find((q) => q.error)?.error;

  const totalCategoryRows = useMemo(
    () => categoryQueries.reduce((acc, q) => acc + (Array.isArray(q.data) ? q.data.length : 0), 0),
    [categoryQueries],
  );

  const [dialog, setDialog] = useState<CategoryDialog | null>(null);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [placement, setPlacement] = useState<CategoryPlacement>("top");
  const [addRestaurantId, setAddRestaurantId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const { requestConfirm, ConfirmDialog } = useConfirmAction();

  const formCategoriesRestaurantId =
    dialog?.kind === "add" ? addRestaurantId : dialog?.kind === "edit" ? dialog.cat.restaurant : null;
  const { data: formCategoriesRaw = [] } = useCategories(formCategoriesRestaurantId);
  const formCategories = formCategoriesRaw as CatRow[];

  const formChildrenByParent = useMemo(() => buildChildrenByParent(formCategories), [formCategories]);
  const blockedParentIds = useMemo(() => {
    if (dialog?.kind !== "edit") return new Set<number>();
    const ex = collectDescendantIds(dialog.cat.id, formChildrenByParent);
    ex.add(dialog.cat.id);
    return ex;
  }, [dialog, formChildrenByParent]);

  const parentSelectRows = useMemo(() => {
    const flat = flattenCategoryTreeForSelect(formCategories);
    if (dialog?.kind !== "edit") return flat;
    return flat.filter((row) => !blockedParentIds.has(row.id));
  }, [formCategories, dialog, blockedParentIds]);

  const openAdd = () => {
    setName("");
    setParentId("");
    setPlacement("top");
    setAddRestaurantId(restaurantId);
    setImageFile(null);
    setFormError(null);
    setDialog({ kind: "add" });
  };

  const openEdit = (c: CatRow) => {
    setName(c.name);
    setParentId(c.parent != null ? String(c.parent) : "");
    setPlacement(c.parent == null ? "top" : "nested");
    setImageFile(null);
    setFormError(null);
    setDialog({ kind: "edit", cat: c });
  };

  const invalidateAllCategoryQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ["categories"] });
  };

  const handleSaveCategory = async () => {
    if (!token || dialog == null) return;
    if (dialog.kind !== "edit" && dialog.kind !== "add") return;

    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Name is required.");
      return;
    }

    if (dialog.kind === "add" && addRestaurantId == null) {
      setFormError("Select a restaurant.");
      return;
    }

    let parent: number | null = null;
    if (placement === "top") {
      parent = null;
    } else {
      if (parentId === "") {
        setFormError("Select a parent category for a nested (child) category.");
        return;
      }
      const p = Number.parseInt(parentId, 10);
      if (Number.isNaN(p)) {
        setFormError("Invalid parent category.");
        return;
      }
      parent = p;
    }

    setSaving(true);
    setFormError(null);
    try {
      const useMultipart = imageFile != null;
      if (dialog.kind === "edit") {
        if (useMultipart) {
          const fd = new FormData();
          fd.append("name", trimmed);
          if (parent === null) fd.append("parent", "");
          else fd.append("parent", String(parent));
          fd.append("image", imageFile);
          await apiPatchForm(`/api/categories/${dialog.cat.id}/`, fd, token);
        } else {
          await apiPatch(`/api/categories/${dialog.cat.id}/`, { name: trimmed, parent }, token);
        }
      } else if (addRestaurantId != null) {
        if (useMultipart) {
          const fd = new FormData();
          fd.append("name", trimmed);
          if (parent != null) fd.append("parent", String(parent));
          await apiPostForm(`/api/categories/?restaurant_id=${addRestaurantId}`, fd, token);
        } else {
          await apiPost(
            `/api/categories/?restaurant_id=${addRestaurantId}`,
            { name: trimmed, parent },
            token,
          );
        }
      }
      invalidateAllCategoryQueries();
      setDialog(null);
      setImageFile(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (fetchIds.length === 0) return <p className="text-sm text-text-muted">No restaurant context.</p>;
  if (loadError) return <p className="text-sm text-error">Failed to load categories.</p>;
  if (isLoading) return <p className="text-sm text-text-muted">Loading…</p>;

  const renderCategoryActions = (c: CatRow) => (
    <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
      <Link
        to="/owner/products"
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-surface"
      >
        <Eye size={12} /> View
      </Link>
      <button
        type="button"
        onClick={() => openEdit(c)}
        className="rounded-lg bg-primary-50 px-2 py-1 text-xs font-medium text-primary hover:bg-primary-100"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={() => {
          if (!token || deletingId != null) return;
          requestConfirm({
            title: "Delete category",
            message: `Delete category "${c.name}"? Products in this category may be affected.`,
            confirmLabel: "Delete",
            variant: "danger",
            onConfirm: async () => {
              setDeletingId(c.id);
              try {
                await apiDelete(`/api/categories/${c.id}/`, token);
                invalidateAllCategoryQueries();
              } finally {
                setDeletingId(null);
              }
            },
          });
        }}
        disabled={deletingId === c.id}
        className="rounded-lg bg-error/10 px-2 py-1 text-xs font-medium text-error disabled:opacity-50"
      >
        <Trash2 size={12} className="inline" /> {deletingId === c.id ? "..." : ""}
      </button>
    </div>
  );

  const dialogTitle = dialog == null ? "" : dialog.kind === "edit" ? "Edit category" : "Add category";

  /** No valid parent exists (empty tree or only self in edit). */
  const nestedParentUnavailable = placement === "nested" && parentSelectRows.length === 0;

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display font-semibold text-lg text-foreground">Categories</h2>
        <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
          <div
            className="inline-flex rounded-full border border-border bg-card p-0.5 shadow-sm"
            role="group"
            aria-label="Category layout"
          >
            <button
              type="button"
              aria-pressed={viewMode === "list"}
              onClick={() => setViewMode("list")}
              className={cn(
                "flex min-h-10 flex-1 items-center justify-center gap-1 rounded-full px-3 py-2 text-foreground transition-all sm:min-w-[7.25rem] sm:px-4",
                viewMode === "list"
                  ? "border-2 border-primary bg-primary-50 font-medium"
                  : "border-2 border-transparent text-text-secondary hover:bg-surface",
              )}
            >
              {viewMode === "list" ? <Check className="size-4 shrink-0" strokeWidth={2.5} aria-hidden /> : null}
              <List className="size-4 shrink-0" aria-hidden />
              <span className="hidden sm:inline text-sm">List</span>
            </button>
            <button
              type="button"
              aria-pressed={viewMode === "grid"}
              onClick={() => setViewMode("grid")}
              className={cn(
                "flex min-h-10 flex-1 items-center justify-center gap-1 rounded-full px-3 py-2 text-foreground transition-all sm:min-w-[7.25rem] sm:px-4",
                viewMode === "grid"
                  ? "border-2 border-primary bg-primary-50 font-medium"
                  : "border-2 border-transparent text-text-secondary hover:bg-surface",
              )}
            >
              {viewMode === "grid" ? <Check className="size-4 shrink-0" strokeWidth={2.5} aria-hidden /> : null}
              <LayoutGrid className="size-4 shrink-0" aria-hidden />
              <span className="hidden sm:inline text-sm">Grid</span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => openAdd()}
            className="flex h-10 items-center gap-1 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-600"
          >
            <Plus size={14} />
            Add category
          </button>
        </div>
      </div>
      {totalCategoryRows === 0 ? (
        <div className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-text-muted">
          No categories yet. Add a parent category to get started.
        </div>
      ) : (
        <div className="space-y-10">
          {fetchIds.map((rid, idx) => {
            const cats = (categoryQueries[idx]?.data ?? []) as CatRow[];
            const sectionTitle =
              restaurantNameById.get(rid) ?? cats[0]?.restaurant_name ?? `Restaurant #${rid}`;
            return (
              <section key={rid}>
                {fetchIds.length > 1 ? (
                  <h3 className="mb-3 font-display text-base font-semibold text-foreground">{sectionTitle}</h3>
                ) : null}
                <CategoriesForRestaurant
                  categories={cats}
                  viewMode={viewMode}
                  showRestaurantSubtext={fetchIds.length === 1}
                  restaurantNameById={restaurantNameById}
                  renderCategoryActions={renderCategoryActions}
                />
              </section>
            );
          })}
        </div>
      )}

      {dialog != null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md shadow-xl">
            <h3 className="font-display font-semibold text-lg text-foreground mb-4">{dialogTitle}</h3>
            {formError && <p className="text-sm text-error mb-3">{formError}</p>}
            <div className="space-y-4">
              {dialog.kind === "add" && (
                <div>
                  <label className="text-sm font-medium text-text-secondary mb-1.5 block">Restaurant *</label>
                  <select
                    value={addRestaurantId ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setAddRestaurantId(v === "" ? null : Number.parseInt(v, 10));
                      setParentId("");
                    }}
                    className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                  >
                    <option value="">Select restaurant…</option>
                    {restaurantIds.map((rid) => (
                      <option key={rid} value={rid}>
                        {restaurants.find((r) => r.id === rid)?.name ?? `Restaurant #${rid}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block">Category type *</label>
                <select
                  value={placement}
                  onChange={(e) => {
                    const v = e.target.value as CategoryPlacement;
                    setPlacement(v);
                    if (v === "top") setParentId("");
                  }}
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                >
                  <option value="top">Parent category (top-level)</option>
                  <option value="nested">Child category (nested under a parent)</option>
                </select>
                <p className="mt-1.5 text-xs text-text-muted">
                  Parent categories sit at the top of the tree. Child categories appear under the parent you choose.
                </p>
              </div>
              {placement === "nested" && (
                <div>
                  <label className="text-sm font-medium text-text-secondary mb-1.5 block">Parent category *</label>
                  {nestedParentUnavailable ? (
                    <p className="text-sm text-text-muted">
                      {dialog.kind === "add"
                        ? "Add a top-level category in this restaurant first, then you can create nested children under it."
                        : "There is no other category to nest under yet, or the tree only contains this category."}
                    </p>
                  ) : (
                    <select
                      value={parentId}
                      onChange={(e) => setParentId(e.target.value)}
                      className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                    >
                      <option value="">Select parent…</option>
                      {parentSelectRows.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block">Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Category name"
                  className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-1.5 block">Image (optional)</label>
                <input
                  type="file"
                  accept="image/*"
                  key={dialog.kind === "edit" ? `e-${dialog.cat.id}` : `a-${addRestaurantId ?? "x"}`}
                  onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                  className="w-full text-sm text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-xs file:font-medium file:text-primary"
                />
                {imageFile ? (
                  <p className="mt-1.5 text-xs text-text-muted">New image will be saved when you click Save.</p>
                ) : null}
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setDialog(null);
                  setImageFile(null);
                }}
                className="flex-1 h-11 rounded-xl border border-border text-sm font-semibold text-text-secondary hover:bg-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || nestedParentUnavailable}
                onClick={() => void handleSaveCategory()}
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
