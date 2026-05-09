import { useState, useEffect } from "react";
import { apiGet } from "@/lib/api";

function getDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const RADIUS_METERS = 50;

export interface RestaurantRow {
  id: number;
  name: string;
  address: string;
  is_open: boolean;
  can_delivery: boolean;
  delivery_radius_km?: number | string;
  latitude: string | number | null;
  longitude: string | number | null;
}

export function useLocationCheck() {
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [restaurants, setRestaurants] = useState<RestaurantRow[]>([]);
  const [nearbyRestaurant, setNearbyRestaurant] = useState<RestaurantRow | null>(null);
  const [mode, setMode] = useState<"dine-in" | "delivery">("delivery");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      let rows: RestaurantRow[] = [];
      try {
        rows = await apiGet<RestaurantRow[]>("/api/restaurants/");
      } catch {
        rows = [];
      }
      if (cancelled) return;
      setRestaurants(rows);

      if (!navigator.geolocation) {
        setLoading(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setUserLat(lat);
          setUserLng(lng);
          const nearest = rows
            .filter((r) => r.is_open && r.latitude != null && r.longitude != null)
            .map((r) => ({
              ...r,
              distance: getDistanceMeters(lat, lng, Number(r.latitude), Number(r.longitude)),
            }))
            .sort((a, b) => a.distance - b.distance)[0];
          if (nearest && nearest.distance <= RADIUS_METERS) {
            setNearbyRestaurant(nearest);
            setMode("dine-in");
          } else {
            setMode("delivery");
          }
          setLoading(false);
        },
        () => {
          if (!cancelled) setLoading(false);
        },
        { timeout: 5000 },
      );
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return { userLat, userLng, loading, nearbyRestaurant, restaurants, mode, setMode };
}
