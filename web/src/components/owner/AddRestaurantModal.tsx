import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { LocationMapPicker } from "@/components/shared/LocationMapPicker";
import { apiGet, apiPost } from "@/lib/api";
import { slugifyName } from "@/lib/slugify";
import { useAuth } from "@/lib/auth-context";
import { X } from "lucide-react";

export type GeocodeHit = {
  lat: string;
  lon: string;
  display_name: string;
  /** Nominatim place id when present — stable key for list items */
  place_id?: string;
};

interface AddRestaurantModalProps {
  open: boolean;
  onClose: () => void;
}

export function AddRestaurantModal({ open, onClose }: AddRestaurantModalProps) {
  const queryClient = useQueryClient();
  const { token, user } = useAuth();
  const inputClass =
    "w-full h-11 px-4 rounded-xl border border-border bg-card text-sm text-foreground outline-none focus:border-primary";

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radiusM, setRadiusM] = useState("150");
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState("50");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [geoQuery, setGeoQuery] = useState("");
  const [geoHits, setGeoHits] = useState<GeocodeHit[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoOpen, setGeoOpen] = useState(false);

  const resetForm = useCallback(() => {
    const ownerPhone = user?.phone?.trim() ?? "";
    setName("");
    setPhone(ownerPhone);
    setAddress("");
    setLat("");
    setLng("");
    setRadiusM("150");
    setDeliveryRadiusKm("50");
    setMessage(null);
    setGeoQuery("");
    setGeoHits([]);
    setGeoError(null);
    setGeoOpen(false);
  }, [user?.phone]);

  useEffect(() => {
    if (open) resetForm();
  }, [open, resetForm]);

  useEffect(() => {
    if (!open) return;
    const q = geoQuery.trim();
    if (q.length < 2) {
      setGeoHits([]);
      setGeoLoading(false);
      setGeoError(null);
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    const t = window.setTimeout(() => {
      void (async () => {
        if (!token) return;
        try {
          const enc = encodeURIComponent(q);
          const rows = await apiGet<GeocodeHit[]>(`/api/geocode/?q=${enc}`, token);
          setGeoHits(Array.isArray(rows) ? rows : []);
          setGeoOpen(true);
        } catch (e) {
          setGeoHits([]);
          setGeoError(e instanceof Error ? e.message : "Search failed.");
        } finally {
          setGeoLoading(false);
        }
      })();
    }, 400);
    return () => window.clearTimeout(t);
  }, [geoQuery, open, token]);

  const pickGeocode = (hit: GeocodeHit) => {
    const la = Number.parseFloat(hit.lat);
    const lo = Number.parseFloat(hit.lon);
    if (Number.isFinite(la) && Number.isFinite(lo)) {
      setLat(la.toFixed(7));
      setLng(lo.toFixed(7));
    }
    setAddress(hit.display_name);
    setGeoOpen(false);
    setGeoQuery("");
  };

  const submit = async () => {
    if (!token) return;
    setSaving(true);
    setMessage(null);
    try {
      const radius = Number.parseFloat(radiusM);
      if (!Number.isFinite(radius) || radius < 0.1 || radius > 5000) {
        setMessage("Alert radius must be between 0.1 and 5000 meters.");
        return;
      }
      const la = Number.parseFloat(lat);
      const lo = Number.parseFloat(lng);
      const deliveryRadius = Number.parseFloat(deliveryRadiusKm);
      if (!Number.isFinite(la) || !Number.isFinite(lo)) {
        setMessage("Set the restaurant location using map search or the map pin.");
        return;
      }
      if (!Number.isFinite(deliveryRadius) || deliveryRadius < 0.1) {
        setMessage("Delivery radius must be at least 0.1 km.");
        return;
      }
      const body: Record<string, unknown> = {
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        latitude: la,
        longitude: lo,
        reference_latitude: la,
        reference_longitude: lo,
        proximity_alert_radius_m: radius,
        delivery_radius_km: deliveryRadius,
      };
      await apiPost<unknown>("/api/restaurants/", body, token);
      void queryClient.invalidateQueries({ queryKey: ["restaurants"] });
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      onClose();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not create restaurant.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div
        className="bg-card rounded-2xl border border-border shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-restaurant-title"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card px-5 py-4">
          <h2 id="add-restaurant-title" className="font-display font-semibold text-lg text-foreground">
            Add restaurant
          </h2>
          <button
            type="button"
            className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-border text-text-muted hover:text-foreground"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-text-muted">
            Your request will be sent to the super admin for approval. Until the restaurant is activated, it will not
            appear in your working restaurant list or to customers.
          </p>
          <div>
            <label className="text-sm font-medium text-text-secondary block mb-1.5">Restaurant name</label>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
            {slugifyName(name.trim()) ? (
              <p className="mt-1 text-xs text-text-muted">
                Slug preview: <span className="font-mono text-foreground">{slugifyName(name.trim())}</span> (saved
                when approved; made unique on the server if needed)
              </p>
            ) : null}
          </div>
          <div>
            <label className="text-sm font-medium text-text-secondary block mb-1.5">Phone</label>
            <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="relative">
            <label className="text-sm font-medium text-text-secondary block mb-1.5">Find on map (search)</label>
            <input
              className={inputClass}
              value={geoQuery}
              onChange={(e) => setGeoQuery(e.target.value)}
              onFocus={() => {
                if (geoHits.length) setGeoOpen(true);
              }}
              placeholder="Street, place, or business name…"
              autoComplete="off"
            />
            {geoLoading ? <p className="mt-1 text-xs text-text-muted">Searching…</p> : null}
            {geoError ? <p className="mt-1 text-xs text-error">{geoError}</p> : null}
            <p className="mt-1 text-[11px] text-text-muted">
              Search is limited to Nepal (OpenStreetMap / Nominatim). Pick a result or place the pin on the map
              below.
            </p>
            {geoOpen && geoHits.length > 0 ? (
              <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-border bg-card text-sm shadow-lg">
                <p className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
                  Best match
                </p>
                <button
                  type="button"
                  className="w-full border-b border-primary/30 bg-primary/5 px-3 py-2.5 text-left font-medium text-foreground hover:bg-primary/10"
                  onClick={() => pickGeocode(geoHits[0])}
                >
                  {geoHits[0].display_name}
                </button>
                {geoHits.length > 1 ? (
                  <>
                    <p className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
                      Other places
                    </p>
                    <ul className="pb-1">
                      {geoHits.slice(1).map((h, i) => (
                        <li key={h.place_id ? `${h.place_id}` : `${h.lat}-${h.lon}-${i + 1}`}>
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left text-foreground/90 hover:bg-surface-alt"
                            onClick={() => pickGeocode(h)}
                          >
                            {h.display_name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
          <div>
            <label className="text-sm font-medium text-text-secondary block mb-1.5">Address</label>
            <input className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div>
            <p className="text-sm font-medium text-text-secondary mb-2">Restaurant location</p>
            <p className="text-xs text-text-muted mb-2">
              Choose a search result or click / drag the pin on the map. Latitude and longitude fill in automatically.
            </p>
            <div className="mt-3 mb-3">
              <LocationMapPicker
                latitude={lat}
                longitude={lng}
                onCoordinatesChange={(nextLat, nextLng) => {
                  setLat(nextLat);
                  setLng(nextLng);
                }}
              />
            </div>
            <p className="text-sm font-medium text-text-secondary mb-2">Restaurant latitude / longitude</p>
            <div className="grid grid-cols-2 gap-3">
              <input
                className={`${inputClass} bg-surface-alt text-text-muted cursor-not-allowed`}
                placeholder="Set via map or search"
                value={lat}
                readOnly
                tabIndex={-1}
                aria-readonly="true"
              />
              <input
                className={`${inputClass} bg-surface-alt text-text-muted cursor-not-allowed`}
                placeholder="Set via map or search"
                value={lng}
                readOnly
                tabIndex={-1}
                aria-readonly="true"
              />
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-text-secondary mb-2">Reference latitude / longitude</p>
            <p className="text-xs text-text-muted mb-2">
              Matches the restaurant pin above (same values stored on the server for proximity alerts). This cannot be
              edited separately.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <input
                className={`${inputClass} bg-surface-alt text-text-muted cursor-not-allowed`}
                placeholder="Same as restaurant latitude"
                value={lat}
                readOnly
                tabIndex={-1}
                aria-readonly="true"
              />
              <input
                className={`${inputClass} bg-surface-alt text-text-muted cursor-not-allowed`}
                placeholder="Same as restaurant longitude"
                value={lng}
                readOnly
                tabIndex={-1}
                aria-readonly="true"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-text-secondary block mb-1.5">
              Unpaid proximity alert radius (meters)
            </label>
            <input
              type="number"
              min={0.1}
              step={0.1}
              className={inputClass}
              value={radiusM}
              onChange={(e) => setRadiusM(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-text-secondary block mb-1.5">
              Delivery radius (km)
            </label>
            <input
              type="number"
              min={0.1}
              step={0.1}
              className={inputClass}
              value={deliveryRadiusKm}
              onChange={(e) => setDeliveryRadiusKm(e.target.value)}
            />
          </div>
          {message && <p className="text-sm text-error">{message}</p>}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              className="h-11 flex-1 rounded-xl border border-border text-sm font-semibold"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || !name.trim()}
              onClick={() => void submit()}
              className="h-11 flex-1 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
            >
              {saving ? "Submitting…" : "Submit for approval"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
