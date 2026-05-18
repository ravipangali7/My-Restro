import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { LocationMapPicker } from "@/components/shared/LocationMapPicker";
import { apiPatch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { X } from "lucide-react";

export interface EditRestaurantTarget {
  id: number;
  name: string;
  phone: string;
  address: string;
  latitude: string | number | null;
  longitude: string | number | null;
  proximity_alert_radius_m: string | number;
  delivery_radius_km?: string | number;
  can_delivery?: boolean;
  delivery_fee_per_km?: string | number;
  is_active?: boolean;
}

interface EditRestaurantModalProps {
  open: boolean;
  restaurant: EditRestaurantTarget | null;
  onClose: () => void;
}

export function EditRestaurantModal({ open, restaurant, onClose }: EditRestaurantModalProps) {
  const queryClient = useQueryClient();
  const { token } = useAuth();
  const inputClass =
    "w-full h-11 px-4 rounded-xl border border-border bg-card text-sm text-foreground outline-none focus:border-primary disabled:opacity-60 disabled:cursor-not-allowed";

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radiusM, setRadiusM] = useState("150");
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState("50");
  const [canDelivery, setCanDelivery] = useState(false);
  const [deliveryFeePerKm, setDeliveryFeePerKm] = useState("0");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    if (!restaurant) return;
    setName(restaurant.name ?? "");
    setPhone(restaurant.phone ?? "");
    setAddress(restaurant.address ?? "");
    setLat(restaurant.latitude != null ? String(restaurant.latitude) : "");
    setLng(restaurant.longitude != null ? String(restaurant.longitude) : "");
    setRadiusM(
      restaurant.proximity_alert_radius_m != null ? String(restaurant.proximity_alert_radius_m) : "150",
    );
    setDeliveryRadiusKm(
      restaurant.delivery_radius_km != null ? String(restaurant.delivery_radius_km) : "50",
    );
    setCanDelivery(Boolean(restaurant.can_delivery));
    setDeliveryFeePerKm(
      restaurant.delivery_fee_per_km != null ? String(restaurant.delivery_fee_per_km) : "0",
    );
    setMessage(null);
  }, [restaurant]);

  useEffect(() => {
    if (open && restaurant) resetForm();
  }, [open, restaurant, resetForm]);

  const submit = async () => {
    if (!token || !restaurant) return;
    if (restaurant.is_active === false) {
      setMessage("This restaurant is pending approval and cannot be edited yet.");
      return;
    }
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
      const deliveryFee = Number.parseFloat(deliveryFeePerKm);
      if (!Number.isFinite(la) || !Number.isFinite(lo)) {
        setMessage("Set the restaurant location using map search or the map pin.");
        return;
      }
      if (!Number.isFinite(deliveryRadius) || deliveryRadius < 0.1) {
        setMessage("Delivery radius must be at least 0.1 km.");
        return;
      }
      if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
        setMessage("Delivery fee per km must be a non-negative number.");
        return;
      }
      if (!name.trim()) {
        setMessage("Restaurant name is required.");
        return;
      }
      if (!phone.trim()) {
        setMessage("Phone is required.");
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
        can_delivery: canDelivery,
        delivery_fee_per_km: deliveryFee,
      };
      await apiPatch<unknown>(`/api/restaurants/${restaurant.id}/`, body, token);
      void queryClient.invalidateQueries({ queryKey: ["restaurants"] });
      onClose();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not update restaurant.");
    } finally {
      setSaving(false);
    }
  };

  if (!open || !restaurant) return null;

  const pending = restaurant.is_active === false;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div
        className="bg-card rounded-2xl border border-border shadow-xl w-full max-w-lg max-h-[min(92dvh,calc(100vh-2rem))] overflow-y-auto overscroll-contain"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-restaurant-title"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card px-5 py-4">
          <h2 id="edit-restaurant-title" className="font-display font-semibold text-lg text-foreground truncate pr-2">
            Edit {restaurant.name}
          </h2>
          <button
            type="button"
            className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-border text-text-muted hover:text-foreground shrink-0"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <motionlessFormBody
          pending={pending}
          inputClass={inputClass}
          name={name}
          setName={setName}
          phone={phone}
          setPhone={setPhone}
          address={address}
          setAddress={setAddress}
          lat={lat}
          lng={lng}
          setLat={setLat}
          setLng={setLng}
          radiusM={radiusM}
          setRadiusM={setRadiusM}
          canDelivery={canDelivery}
          setCanDelivery={setCanDelivery}
          deliveryFeePerKm={deliveryFeePerKm}
          setDeliveryFeePerKm={setDeliveryFeePerKm}
          deliveryRadiusKm={deliveryRadiusKm}
          setDeliveryRadiusKm={setDeliveryRadiusKm}
          message={message}
          saving={saving}
          onClose={onClose}
          onSubmit={() => void submit()}
        />
      </div>
    </div>
  );
}

function motionlessFormBody(props: {
  pending: boolean;
  inputClass: string;
  name: string;
  setName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  address: string;
  setAddress: (v: string) => void;
  lat: string;
  lng: string;
  setLat: (v: string) => void;
  setLng: (v: string) => void;
  radiusM: string;
  setRadiusM: (v: string) => void;
  canDelivery: boolean;
  setCanDelivery: (v: boolean) => void;
  deliveryFeePerKm: string;
  setDeliveryFeePerKm: (v: string) => void;
  deliveryRadiusKm: string;
  setDeliveryRadiusKm: (v: string) => void;
  message: string | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const {
    pending,
    inputClass,
    name,
    setName,
    phone,
    setPhone,
    address,
    setAddress,
    lat,
    lng,
    setLat,
    setLng,
    radiusM,
    setRadiusM,
    canDelivery,
    setCanDelivery,
    deliveryFeePerKm,
    setDeliveryFeePerKm,
    deliveryRadiusKm,
    setDeliveryRadiusKm,
    message,
    saving,
    onClose,
    onSubmit,
  } = props;

  return (
    <div className="p-5 space-y-4">
      {pending ? (
        <p className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
          This restaurant is waiting for super admin approval. You can view details but cannot save changes until it is
          activated.
        </p>
      ) : null}
      <div>
        <label className="text-sm font-medium text-text-secondary block mb-1.5">Restaurant name</label>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} disabled={pending} />
      </div>
      <div>
        <label className="text-sm font-medium text-text-secondary block mb-1.5">Phone</label>
        <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} disabled={pending} />
      </div>
      <div>
        <label className="text-sm font-medium text-text-secondary block mb-1.5">Address</label>
        <input
          className={inputClass}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Filled from map search or coordinates"
          disabled={pending}
        />
      </div>
      <div>
        <p className="text-sm font-medium text-text-secondary mb-2">Restaurant location</p>
        <p className="text-xs text-text-muted mb-2">
          Search for a place, click the map, or drag the pin. Latitude, longitude, and address update automatically.
        </p>
        <motionlessMapPicker lat={lat} lng={lng} setLat={setLat} setLng={setLng} setAddress={setAddress} pending={pending} />
        <p className="text-sm font-medium text-text-secondary mb-2 mt-3">Restaurant latitude / longitude</p>
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
          disabled={pending}
        />
      </div>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-text-secondary">Offer delivery</label>
        <button
          type="button"
          disabled={pending}
          onClick={() => setCanDelivery((v) => !v)}
          className={`w-12 h-6 rounded-full disabled:opacity-50 ${canDelivery ? "bg-primary" : "bg-border"}`}
          aria-label="Toggle delivery"
        >
          <div
            className={`w-5 h-5 rounded-full bg-white shadow mt-0.5 transition-transform ${canDelivery ? "translate-x-6" : "translate-x-0.5"}`}
          />
        </button>
      </div>
      <div>
        <label className="text-sm font-medium text-text-secondary block mb-1.5">Delivery fee (per km)</label>
        <input
          type="number"
          min={0}
          step={0.01}
          className={inputClass}
          value={deliveryFeePerKm}
          onChange={(e) => setDeliveryFeePerKm(e.target.value)}
          disabled={pending}
        />
      </div>
      <div>
        <label className="text-sm font-medium text-text-secondary block mb-1.5">Delivery radius (km)</label>
        <input
          type="number"
          min={0.1}
          step={0.1}
          className={inputClass}
          value={deliveryRadiusKm}
          onChange={(e) => setDeliveryRadiusKm(e.target.value)}
          disabled={pending}
        />
      </div>
      {message && <p className="text-sm text-error">{message}</p>}
      <div className="flex gap-3 pt-1">
        <button type="button" className="h-11 flex-1 rounded-xl border border-border text-sm font-semibold" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          disabled={saving || pending || !name.trim()}
          onClick={onSubmit}
          className="h-11 flex-1 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function motionlessMapPicker({
  lat,
  lng,
  setLat,
  setLng,
  setAddress,
  pending,
}: {
  lat: string;
  lng: string;
  setLat: (v: string) => void;
  setLng: (v: string) => void;
  setAddress: (v: string) => void;
  pending: boolean;
}) {
  return (
    <div className="mt-3 mb-3">
      <LocationMapPicker
        latitude={lat}
        longitude={lng}
        onCoordinatesChange={(nextLat, nextLng) => {
          setLat(nextLat);
          setLng(nextLng);
        }}
        onPlaceSelected={setAddress}
        disabled={pending}
      />
    </div>
  );
}
