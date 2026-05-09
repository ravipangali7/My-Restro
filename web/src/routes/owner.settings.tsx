import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LocationMapPicker } from "@/components/shared/LocationMapPicker";
import { usePlatformDefaults, useRestaurants } from "@/hooks/use-rest-api";
import { apiPatch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { PlatformDefaultsDTO } from "@/lib/super-settings-cache";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { MapPin } from "lucide-react";

export const Route = createFileRoute("/owner/settings")({ component: SettingsPage });

interface RestaurantDTO {
  id: number;
  name: string;
  phone: string;
  address: string;
  latitude: string | number | null;
  longitude: string | number | null;
  is_open: boolean;
  can_delivery: boolean;
  delivery_fee_per_km: string | number;
  delivery_radius_km: string | number;
  per_transaction_fee: string | number;
  subscription_start: string | null;
  subscription_end: string | null;
}

function SettingsPage() {
  const queryClient = useQueryClient();
  const { token } = useAuth();
  const { restaurantId, setRestaurantId, restaurantIds } = useRestaurantScope();
  const { data, isLoading, error } = useRestaurants();
  const { data: platformDefaults } = usePlatformDefaults();
  const pd = platformDefaults as PlatformDefaultsDTO | undefined;
  const list = (data ?? []) as RestaurantDTO[];
  const restaurant = list.find((r) => r.id === restaurantId) ?? list[0];

  const [canDelivery, setCanDelivery] = useState(false);
  const [deliveryFeePerKm, setDeliveryFeePerKm] = useState("0");
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState("50");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  useEffect(() => {
    if (restaurant) {
      setLat(restaurant.latitude != null ? String(restaurant.latitude) : "");
      setLng(restaurant.longitude != null ? String(restaurant.longitude) : "");
      setCanDelivery(Boolean(restaurant.can_delivery));
      setDeliveryFeePerKm(
        restaurant.delivery_fee_per_km != null ? String(restaurant.delivery_fee_per_km) : "0",
      );
      setDeliveryRadiusKm(
        restaurant.delivery_radius_km != null ? String(restaurant.delivery_radius_km) : "50",
      );
    }
  }, [restaurant]);

  const inputClass =
    "w-full h-11 px-4 rounded-xl border border-border bg-surface-alt text-sm text-text-muted outline-none disabled:cursor-not-allowed disabled:opacity-80";

  const saveDeliverySettings = async () => {
    if (!token) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const parsed = Number.parseFloat(deliveryFeePerKm);
      const parsedRadius = Number.parseFloat(deliveryRadiusKm);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setSaveMessage("Delivery fee per km must be a non-negative number.");
        return;
      }
      if (!Number.isFinite(parsedRadius) || parsedRadius < 0.1) {
        setSaveMessage("Delivery radius must be at least 0.1 km.");
        return;
      }
      await apiPatch(`/api/restaurants/${restaurant.id}/`, {
        can_delivery: canDelivery,
        delivery_fee_per_km: parsed,
        delivery_radius_km: parsedRadius,
      }, token);
      setSaveMessage("Delivery settings updated.");
      void queryClient.invalidateQueries({ queryKey: ["restaurants"] });
    } catch (e) {
      setSaveMessage(e instanceof Error ? e.message : "Failed to update setting.");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <p className="text-sm text-text-muted">Loading settings…</p>;
  }
  if (error || !restaurant) {
    return <p className="text-sm text-error">Could not load restaurant settings.</p>;
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-semibold text-lg text-foreground">Restaurant Settings</h2>
        <span className="text-xs text-text-muted">Delivery options you can change are below.</span>
      </div>

      {restaurantIds.length > 1 && (
        <div className="mb-4">
          <label className="text-xs text-text-secondary block mb-1">Restaurant</label>
          <select
            value={restaurantId ?? restaurant.id}
            onChange={(e) => setRestaurantId(Number(e.target.value))}
            className="h-10 px-3 rounded-xl border border-border bg-card text-sm"
          >
            {restaurantIds.map((rid) => {
              const name = list.find((r) => r.id === rid)?.name ?? `#${rid}`;
              return (
                <option key={rid} value={rid}>
                  {name}
                </option>
              );
            })}
          </select>
        </div>
      )}

      <div className="bg-card rounded-xl border border-border p-5 max-w-lg">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-text-secondary mb-1.5 block">Restaurant Name</label>
            <input type="text" value={restaurant.name} readOnly disabled className={inputClass} />
          </div>
          <div>
            <label className="text-sm font-medium text-text-secondary mb-1.5 block">Phone</label>
            <input type="text" value={restaurant.phone} readOnly disabled className={inputClass} />
          </div>
          <div>
            <label className="text-sm font-medium text-text-secondary mb-1.5 block">Logo</label>
            <p className="text-sm text-text-muted">Logo managed via API (read-only here)</p>
          </div>
          <div>
            <label className="text-sm font-medium text-text-secondary mb-1.5 block">Address</label>
            <input type="text" value={restaurant.address} readOnly disabled className={inputClass} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-text-secondary">Location</label>
              <button type="button" disabled className="text-xs font-semibold text-text-muted flex items-center gap-1 opacity-70 cursor-not-allowed">
                <MapPin size={12} /> Location read-only
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                step="any"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                readOnly
                disabled
                placeholder="Latitude"
                className={inputClass}
              />
              <input
                type="number"
                step="any"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                readOnly
                disabled
                placeholder="Longitude"
                className={inputClass}
              />
            </div>
            <div className="mt-3">
              <LocationMapPicker
                latitude={lat}
                longitude={lng}
                onCoordinatesChange={(nextLat, nextLng) => {
                  setLat(nextLat);
                  setLng(nextLng);
                }}
                disabled
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-text-secondary">Is Open</label>
            <div className={`w-12 h-6 rounded-full ${restaurant.is_open ? "bg-primary" : "bg-border"}`}>
              <div className={`w-5 h-5 rounded-full bg-white shadow mt-0.5 ${restaurant.is_open ? "translate-x-6" : "translate-x-0.5"}`} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-text-secondary">Can Delivery</label>
            <button
              type="button"
              onClick={() => setCanDelivery((v) => !v)}
              className={`w-12 h-6 rounded-full ${canDelivery ? "bg-primary" : "bg-border"}`}
              aria-label="Toggle delivery setting"
            >
              <div className={`w-5 h-5 rounded-full bg-white shadow mt-0.5 ${canDelivery ? "translate-x-6" : "translate-x-0.5"}`} />
            </button>
          </div>
          <div>
            <label className="text-sm font-medium text-text-secondary mb-1.5 block">Delivery fee (per km)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={deliveryFeePerKm}
              onChange={(e) => setDeliveryFeePerKm(e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm text-foreground outline-none focus:border-primary"
            />
            <p className="mt-1 text-xs text-text-muted">
              Charged by road distance from your restaurant pin to the customer&apos;s delivery pin. Set to 0 to disable per-km pricing.
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-text-secondary mb-1.5 block">Delivery radius (km)</label>
            <input
              type="number"
              min={0.1}
              step="0.1"
              value={deliveryRadiusKm}
              onChange={(e) => setDeliveryRadiusKm(e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm text-foreground outline-none focus:border-primary"
            />
            <p className="mt-1 text-xs text-text-muted">
              Customers can place delivery orders only if their location is inside this radius.
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-text-secondary mb-1.5 block">Per Transaction Fee</label>
            <input
              type="text"
              value={`${restaurant.per_transaction_fee}`}
              readOnly
              className="w-full h-11 px-4 rounded-xl border border-border bg-surface-alt text-sm text-text-muted outline-none"
            />
            <p className="mt-1.5 text-xs text-text-muted">
              Platform default (used when this restaurant&apos;s fee is zero):{" "}
              <span className="font-medium text-text-secondary">
                {pd != null ? `₹${Number(pd.per_transaction_fee).toLocaleString()}` : "—"}
              </span>
            </p>
          </div>
          <div className="rounded-xl border border-border/80 bg-surface-alt/50 p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Platform pricing</p>
            <p className="text-sm text-text-muted">
              Monthly subscription (reference):{" "}
              <span className="font-medium text-foreground">
                {pd != null ? `₹${Number(pd.subscription_fee_per_month).toLocaleString()}` : "—"}
              </span>
            </p>
            <p className="text-sm text-text-muted">
              Due alert threshold:{" "}
              <span className="font-medium text-foreground">
                {pd != null ? `₹${Number(pd.due_threshold).toLocaleString()}` : "—"}
              </span>
            </p>
            <p className="text-sm text-text-muted">
              SMS cost per use:{" "}
              <span className="font-medium text-foreground">
                {pd != null ? `₹${Number(pd.sms_per_usage).toLocaleString()}` : "—"}
              </span>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-text-secondary mb-1.5 block">Subscription Start</label>
              <input
                type="text"
                value={restaurant.subscription_start ?? "—"}
                readOnly
                className="w-full h-11 px-4 rounded-xl border border-border bg-surface-alt text-sm text-text-muted outline-none"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary mb-1.5 block">Subscription End</label>
              <input
                type="text"
                value={restaurant.subscription_end ?? "—"}
                readOnly
                className="w-full h-11 px-4 rounded-xl border border-border bg-surface-alt text-sm text-text-muted outline-none"
              />
            </div>
          </div>
        </div>
        <div className="mt-6 flex items-center gap-3">
          <button type="button" disabled={saving} onClick={() => void saveDeliverySettings()} className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
            {saving ? "Saving..." : "Save delivery settings"}
          </button>
          {saveMessage && <p className="text-xs text-text-muted">{saveMessage}</p>}
        </div>
      </div>
    </>
  );
}
