import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useCreateTable, useOwnerTablesByRestaurant, useTables, useUpdateTable } from "@/hooks/use-rest-api";
import { useRestaurants } from "@/hooks/use-rest-api";
import { LocationMapPicker } from "@/components/shared/LocationMapPicker";
import { resolveMediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useRestaurantScope } from "@/lib/restaurant-context";

export function TableFormPage({ tableId }: { tableId?: number }) {
  const isEdit = tableId != null;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { restaurantId, restaurantIds } = useRestaurantScope();
  const ownerRestaurantIds = user?.restaurant_ids ?? [];
  const { data: restaurants = [] } = useRestaurants();
  const assignableRestaurants = useMemo(() => {
    const rows = (restaurants as { id: number; name: string; is_active?: boolean }[]) ?? [];
    const activeRows = rows.filter((r) => r.is_active !== false);
    if (!ownerRestaurantIds.length) return activeRows;
    const allowed = new Set(ownerRestaurantIds);
    return activeRows.filter((r) => allowed.has(r.id));
  }, [restaurants, ownerRestaurantIds]);
  const [addRestaurantId, setAddRestaurantId] = useState<number | null>(null);
  useEffect(() => {
    if (isEdit) return;
    setAddRestaurantId((prev) => {
      if (prev != null && assignableRestaurants.some((r) => r.id === prev)) return prev;
      if (restaurantId != null && assignableRestaurants.some((r) => r.id === restaurantId)) return restaurantId;
      return assignableRestaurants[0]?.id ?? restaurantId ?? null;
    });
  }, [isEdit, restaurantId, assignableRestaurants]);

  const needsEditRestaurantLookup = Boolean(isEdit && tableId != null && restaurantIds.length > 1);
  const { sections: ownerTableSections, isPending: editRestaurantLookupPending } = useOwnerTablesByRestaurant({
    enabled: needsEditRestaurantLookup,
  });
  const editCrossRow = useMemo(() => {
    if (!needsEditRestaurantLookup || tableId == null) return null;
    for (const s of ownerTableSections) {
      const row = (s.tables as { id: number; restaurant: number }[]).find((item) => item.id === tableId);
      if (row) return row;
    }
    return null;
  }, [needsEditRestaurantLookup, tableId, ownerTableSections]);

  const targetRestaurantId = useMemo(() => {
    if (!isEdit) return addRestaurantId ?? restaurantId;
    if (restaurantIds.length <= 1) return restaurantId;
    return editCrossRow?.restaurant ?? null;
  }, [isEdit, addRestaurantId, restaurantId, restaurantIds.length, editCrossRow]);

  const { data: tables = [], isLoading: tablesLoading } = useTables(targetRestaurantId);
  const createTable = useCreateTable();
  const updateTable = useUpdateTable();

  const table = useMemo(
    () => ((tables as { id: number }[]) ?? []).find((item) => item.id === tableId) ?? null,
    [tableId, tables],
  ) as
    | {
        id: number;
        name: string;
        capacity: number;
        floor?: string;
        near_by?: string;
        notes?: string;
        latitude?: string | number | null;
        longitude?: string | number | null;
        is_active: boolean;
        image?: string | null;
      }
    | null;
  const restaurantCoords = useMemo(() => {
    const current = (restaurants as { id: number; latitude?: string | number | null; longitude?: string | number | null }[])
      .find((r) => r.id === targetRestaurantId);
    return {
      latitude: current?.latitude ?? null,
      longitude: current?.longitude ?? null,
    };
  }, [targetRestaurantId, restaurants]);

  const [name, setName] = useState(table?.name ?? "");
  const [capacity, setCapacity] = useState(String(table?.capacity ?? 1));
  const [floor, setFloor] = useState(table?.floor ?? "");
  const [nearBy, setNearBy] = useState(table?.near_by ?? "");
  const [notes, setNotes] = useState(table?.notes ?? "");
  const [latitude, setLatitude] = useState(String(table?.latitude ?? ""));
  const [longitude, setLongitude] = useState(String(table?.longitude ?? ""));
  const [isActive, setIsActive] = useState(table?.is_active ?? true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const existingImage = resolveMediaUrl(table?.image);
  const hasImage = Boolean(previewUrl || existingImage);

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    if (!table) return;
    setName(table.name);
    setCapacity(String(table.capacity));
    setFloor(table.floor ?? "");
    setNearBy(table.near_by ?? "");
    setNotes(table.notes ?? "");
    setLatitude(String(table.latitude ?? ""));
    setLongitude(String(table.longitude ?? ""));
    setIsActive(table.is_active);
  }, [table]);

  useEffect(() => {
    if (isEdit) return;
    const current = (
      restaurants as {
        id: number;
        latitude?: string | number | null;
        longitude?: string | number | null;
      }[]
    ).find((r) => r.id === targetRestaurantId);
    if (current?.latitude != null && current?.longitude != null) {
      setLatitude(Number(current.latitude).toFixed(7));
      setLongitude(Number(current.longitude).toFixed(7));
    } else {
      setLatitude("");
      setLongitude("");
    }
  }, [isEdit, targetRestaurantId, restaurants]);

  if (isEdit && restaurantIds.length === 0) {
    return <p className="text-sm text-text-muted">No restaurants assigned.</p>;
  }
  if (isEdit && restaurantIds.length === 1 && restaurantId == null) {
    return <p className="text-sm text-text-muted">No restaurant context.</p>;
  }
  if (!isEdit && targetRestaurantId == null) {
    return <p className="text-sm text-text-muted">No restaurant available to add a table.</p>;
  }
  if (isEdit && needsEditRestaurantLookup && editRestaurantLookupPending) {
    return <p className="text-sm text-text-muted">Loading…</p>;
  }
  if (isEdit && needsEditRestaurantLookup && !editRestaurantLookupPending && !editCrossRow) {
    return <p className="text-sm text-text-muted">Table not found.</p>;
  }
  if (isEdit && !table && tablesLoading) {
    return <p className="text-sm text-text-muted">Loading…</p>;
  }
  if (isEdit && !table) return <p className="text-sm text-text-muted">Table not found.</p>;

  const saving = createTable.isPending || updateTable.isPending;

  const onSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setError("Name is required.");
    const parsedCapacity = Number.parseInt(capacity, 10);
    if (Number.isNaN(parsedCapacity) || parsedCapacity < 1) return setError("Capacity must be at least 1.");

    setError(null);
    const formData = new FormData();
    formData.append("name", trimmed);
    formData.append("capacity", String(parsedCapacity));
    formData.append("floor", floor);
    formData.append("near_by", nearBy);
    formData.append("notes", notes);
    formData.append("is_active", isActive ? "true" : "false");
    if (latitude.trim()) formData.append("latitude", latitude.trim());
    if (longitude.trim()) formData.append("longitude", longitude.trim());
    if (imageFile) formData.append("image", imageFile);

    try {
      if (isEdit && tableId != null && targetRestaurantId != null) {
        await updateTable.mutateAsync({ tableId, restaurantId: targetRestaurantId, formData });
      } else if (!isEdit && targetRestaurantId != null) {
        await createTable.mutateAsync({ restaurantId: targetRestaurantId, formData });
      }
      navigate({ to: "/owner/tables" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <h2 className="font-display text-lg font-semibold text-foreground">{isEdit ? "Edit table" : "Add table"}</h2>
        {error && <p className="text-sm text-error">{error}</p>}
        {!isEdit && assignableRestaurants.length > 1 ? (
          <div>
            <label className="text-sm font-medium text-text-secondary mb-1.5 block">Restaurant</label>
            <select
              value={targetRestaurantId ?? ""}
              onChange={(e) => setAddRestaurantId(Number(e.target.value))}
              className="w-full h-11 rounded-xl border border-border bg-card px-4 text-sm outline-none focus:border-primary"
            >
              {assignableRestaurants.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Table name" className="h-11 rounded-xl border border-border bg-card px-4 text-sm outline-none focus:border-primary" />
          <input value={capacity} onChange={(e) => setCapacity(e.target.value)} type="number" min={1} placeholder="Capacity" className="h-11 rounded-xl border border-border bg-card px-4 text-sm outline-none focus:border-primary" />
          <input value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="Floor" className="h-11 rounded-xl border border-border bg-card px-4 text-sm outline-none focus:border-primary" />
          <input value={nearBy} onChange={(e) => setNearBy(e.target.value)} placeholder="Near by" className="h-11 rounded-xl border border-border bg-card px-4 text-sm outline-none focus:border-primary" />
          <input value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="Latitude" className="h-11 rounded-xl border border-border bg-card px-4 text-sm outline-none focus:border-primary" />
          <input value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="Longitude" className="h-11 rounded-xl border border-border bg-card px-4 text-sm outline-none focus:border-primary" />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-text-secondary">Mini map location picker</p>
          {!latitude.trim() && !longitude.trim() && restaurantCoords.latitude != null && restaurantCoords.longitude != null ? (
            <p className="text-xs text-text-muted">
              Map is centered on restaurant location: {String(restaurantCoords.latitude)}, {String(restaurantCoords.longitude)}
            </p>
          ) : null}
          <LocationMapPicker
            latitude={latitude}
            longitude={longitude}
            defaultLatitude={restaurantCoords.latitude}
            defaultLongitude={restaurantCoords.longitude}
            onCoordinatesChange={(lat, lng) => {
              setLatitude(lat);
              setLongitude(lng);
            }}
            className="h-[210px]"
          />
        </div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" className="min-h-24 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-primary" />
        <div className="space-y-2">
          <label className="text-sm font-medium text-text-secondary">Table image</label>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex h-10 cursor-pointer items-center rounded-xl border border-border px-4 text-sm font-semibold hover:border-primary">
              Select image
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
            </label>
            <span className="text-xs text-text-muted">{imageFile?.name ?? (existingImage ? "Using saved image" : "No image selected")}</span>
            {hasImage ? (
              <button
                type="button"
                onClick={() => setImageFile(null)}
                className="h-9 rounded-lg border border-border px-3 text-xs font-medium"
              >
                Clear selection
              </button>
            ) : null}
          </div>
          <div className="h-32 w-48 overflow-hidden rounded-xl border border-dashed border-border bg-surface p-2">
            {previewUrl ? <img src={previewUrl} alt="" className="h-full w-full object-contain" /> : existingImage ? <img src={existingImage} alt="" className="h-full w-full object-contain" /> : <span className="text-xs text-text-muted">No image selected</span>}
          </div>
        </div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate({ to: "/owner/tables" })} className="h-11 flex-1 rounded-xl border border-border text-sm font-semibold">Cancel</button>
          <button type="button" disabled={saving} onClick={() => void onSave()} className="h-11 flex-1 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {saving ? "Saving..." : isEdit ? "Save changes" : "Create table"}
          </button>
        </div>
      </div>
    </div>
  );
}
