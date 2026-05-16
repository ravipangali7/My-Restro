import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { LocationMapPicker } from "@/components/shared/LocationMapPicker";
import { apiPost } from "@/lib/api";
import { slugifyName } from "@/lib/slugify";
import { useAuth } from "@/lib/auth-context";
import { X } from "lucide-react";

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
  }, [user?.phone]);

  useEffect(() => {
    if (open) resetForm();
  }, [open, resetForm]);

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
        className="bg-card rounded-2xl border border-border shadow-xl w-full max-w-lg max-h-[min(92dvh,calc(100vh-2rem))] overflow-y-auto overscroll-contain"
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
          <div>
            <label className="text-sm font-medium text-text-secondary block mb-1.5">Address</label>
            <input
              className={inputClass}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Filled from map search or coordinates"
            />
          </div>
          <div>
            <p className="text-sm font-medium text-text-secondary mb-2">Restaurant location</p>
            <p className="text-xs text-text-muted mb-2">
              Search for a place, click the map, or drag the pin. Latitude, longitude, and address update automatically.
            </p>
            <div className="mt-3 mb-3">
              <LocationMapPicker
                latitude={lat}
                longitude={lng}
                onCoordinatesChange={(nextLat, nextLng) => {
                  setLat(nextLat);
                  setLng(nextLng);
                }}
                onPlaceSelected={setAddress}
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
