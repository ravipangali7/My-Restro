import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Search } from "lucide-react";
import "leaflet/dist/leaflet.css";

import { cn } from "@/lib/utils";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: () => string })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

/** Kathmandu — default when no coordinates are set yet (Nepal onboarding) */
const FALLBACK_CENTER: [number, number] = [27.7172, 85.324];
const FALLBACK_ZOOM = 13;
const POINT_ZOOM = 17;

function parseCoord(s: string): number | null {
  const n = parseFloat(s.trim());
  if (!Number.isFinite(n)) return null;
  return n;
}

function MapResizeFix() {
  const map = useMap();
  useEffect(() => {
    const id = requestAnimationFrame(() => map.invalidateSize());
    return () => cancelAnimationFrame(id);
  }, [map]);
  return null;
}

function MapViewSync({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.panTo([lat, lng]);
  }, [lat, lng, map]);
  return null;
}

function MapClickHandler({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (!disabled) onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
};

function nominatimCoord(v: unknown): string | null {
  if (typeof v === "string" && v.trim() && Number.isFinite(Number.parseFloat(v))) return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

export type LocationMapPlaceSearchOptions = {
  /** ISO 3166-1alpha2, comma-separated. Default: Nepal only (`np`). */
  countryCodes?: string;
  placeholder?: string;
};

export interface LocationMapPickerProps {
  latitude: string;
  longitude: string;
  onCoordinatesChange: (lat: string, lng: string) => void;
  defaultLatitude?: string | number | null;
  defaultLongitude?: string | number | null;
  disabled?: boolean;
  /** Extra class for the map container (height is required for Leaflet) */
  className?: string;
  /**
   * OpenStreetMap Nominatim search above the map (debounced).
   * Results are biased to `countryCodes` (defaults to Nepal).
   * Pass `false` to hide search. Defaults to enabled when not `false`.
   */
  placeSearch?: LocationMapPlaceSearchOptions | false;
  /**
   * Reverse-geocode coordinates into a human-readable address (debounced).
   * Defaults to enabled when `onPlaceSelected` is provided.
   */
  reverseGeocode?: boolean;
  /** Called with Nominatim `display_name` from search, reverse geocode, or map pin moves. */
  onPlaceSelected?: (displayName: string) => void;
}

function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(7)},${lng.toFixed(7)}`;
}

export function LocationMapPicker({
  latitude,
  longitude,
  onCoordinatesChange,
  defaultLatitude,
  defaultLongitude,
  disabled = false,
  className = "",
  placeSearch,
  reverseGeocode,
  onPlaceSelected,
}: LocationMapPickerProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const reverseAbortRef = useRef<AbortController | null>(null);
  /** Skip the next reverse lookup when address already came from forward search. */
  const skipReverseForKeyRef = useRef<string | null>(null);

  const shouldReverseGeocode = reverseGeocode ?? Boolean(onPlaceSelected);
  const placeSearchOptions = placeSearch === false ? undefined : (placeSearch ?? {});

  const latNum = parseCoord(latitude);
  const lngNum = parseCoord(longitude);
  const hasPoint = latNum != null && lngNum != null;

  const fallbackFromRestaurant = useMemo((): [number, number] | null => {
    const lat = parseCoord(String(defaultLatitude ?? ""));
    const lng = parseCoord(String(defaultLongitude ?? ""));
    return lat != null && lng != null ? [lat, lng] : null;
  }, [defaultLatitude, defaultLongitude]);

  const center = useMemo((): [number, number] => {
    if (hasPoint) return [latNum, lngNum];
    if (fallbackFromRestaurant) return fallbackFromRestaurant;
    return FALLBACK_CENTER;
  }, [hasPoint, latNum, lngNum, fallbackFromRestaurant]);

  const zoom = hasPoint ? POINT_ZOOM : FALLBACK_ZOOM;

  const handlePick = useCallback(
    (lat: number, lng: number) => {
      onCoordinatesChange(lat.toFixed(7), lng.toFixed(7));
    },
    [onCoordinatesChange],
  );

  const onMarkerDrag = useCallback(
    (e: L.LeafletEvent) => {
      const m = e.target as L.Marker;
      const { lat, lng } = m.getLatLng();
      handlePick(lat, lng);
    },
    [handlePick],
  );

  const countryCodes = placeSearchOptions?.countryCodes?.trim() || "np";
  const searchPlaceholder =
    placeSearchOptions?.placeholder ?? "Search street, ward, or place in Nepal…";

  useEffect(() => {
    if (!shouldReverseGeocode || disabled || !onPlaceSelected || !hasPoint) return;

    const key = coordKey(latNum, lngNum);
    if (skipReverseForKeyRef.current === key) {
      skipReverseForKeyRef.current = null;
      return;
    }

    const handle = window.setTimeout(() => {
      reverseAbortRef.current?.abort();
      const ac = new AbortController();
      reverseAbortRef.current = ac;

      const url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.searchParams.set("lat", String(latNum));
      url.searchParams.set("lon", String(lngNum));
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("addressdetails", "1");

      void fetch(url.toString(), {
        signal: ac.signal,
        headers: {
          Accept: "application/json",
          "Accept-Language": "en,ne",
        },
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`Reverse geocode failed (${res.status})`);
          return (await res.json()) as { display_name?: string };
        })
        .then((row) => {
          if (ac.signal.aborted) return;
          const name = typeof row.display_name === "string" ? row.display_name.trim() : "";
          if (name) onPlaceSelected(name);
        })
        .catch((err: unknown) => {
          if (ac.signal.aborted) return;
          if (err instanceof DOMException && err.name === "AbortError") return;
        });
    }, 550);

    return () => {
      window.clearTimeout(handle);
      reverseAbortRef.current?.abort();
    };
  }, [shouldReverseGeocode, disabled, onPlaceSelected, hasPoint, latNum, lngNum]);

  useEffect(() => {
    if (!placeSearchOptions || disabled) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }

    const handle = window.setTimeout(() => {
      searchAbortRef.current?.abort();
      const ac = new AbortController();
      searchAbortRef.current = ac;
      setSearchLoading(true);
      setSearchError(null);

      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", q);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "12");
      url.searchParams.set("countrycodes", countryCodes);
      url.searchParams.set("addressdetails", "1");

      void fetch(url.toString(), {
        signal: ac.signal,
        headers: {
          Accept: "application/json",
          "Accept-Language": "en,ne",
        },
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`Search failed (${res.status})`);
          const data = (await res.json()) as unknown;
          if (!Array.isArray(data)) return [];
          return data
            .map((row) => {
              if (row == null || typeof row !== "object") return null;
              const r = row as Record<string, unknown>;
              const lat = nominatimCoord(r.lat);
              const lon = nominatimCoord(r.lon);
              const display_name = typeof r.display_name === "string" ? r.display_name : null;
              if (lat == null || lon == null || display_name == null) return null;
              return { lat, lon, display_name } satisfies NominatimResult;
            })
            .filter((row): row is NominatimResult => row != null);
        })
        .then((rows) => {
          if (!ac.signal.aborted) {
            setSearchResults(rows);
            setSearchLoading(false);
          }
        })
        .catch((err: unknown) => {
          if (ac.signal.aborted) return;
          if (err instanceof DOMException && err.name === "AbortError") return;
          setSearchLoading(false);
          setSearchResults([]);
          setSearchError(err instanceof Error ? err.message : "Search failed.");
        });
    }, 450);

    return () => {
      window.clearTimeout(handle);
      searchAbortRef.current?.abort();
    };
  }, [placeSearchOptions, disabled, searchQuery, countryCodes]);

  const pickSearchResult = useCallback(
    (row: NominatimResult) => {
      const lat = Number.parseFloat(row.lat);
      const lng = Number.parseFloat(row.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      skipReverseForKeyRef.current = coordKey(lat, lng);
      handlePick(lat, lng);
      onPlaceSelected?.(row.display_name);
      setSearchQuery("");
      setSearchResults([]);
      setSearchError(null);
    },
    [handlePick, onPlaceSelected],
  );

  const showSearch = Boolean(placeSearchOptions) && !disabled;

  const mapBlock = !mounted ? (
    <div
      className={cn(
        "h-[220px] w-full flex items-center justify-center text-text-muted text-sm bg-surface-alt",
        className,
      )}
      style={{ minHeight: 200 }}
    >
      Loading map…
    </div>
  ) : (
    <MapContainer
      center={center}
      zoom={zoom}
      className={cn("h-[220px] w-full z-0", showSearch ? "rounded-b-xl" : "rounded-xl", className)}
      scrollWheelZoom={!disabled}
      dragging={true}
      doubleClickZoom={!disabled}
      touchZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapResizeFix />
      {hasPoint ? <MapViewSync lat={latNum} lng={lngNum} /> : null}
      <MapClickHandler disabled={!!disabled} onPick={handlePick} />
      {hasPoint ? (
        <Marker
          position={[latNum, lngNum]}
          draggable={!disabled}
          eventHandlers={disabled ? undefined : { dragend: onMarkerDrag }}
        />
      ) : null}
    </MapContainer>
  );

  return (
    <div className="rounded-xl border border-border" style={{ minHeight: 200 }}>
      {showSearch ? (
        <div className="p-3 space-y-2 bg-card border-b border-border rounded-t-xl">
          <label className="sr-only" htmlFor="location-map-place-search">
            Search address or place
          </label>
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              aria-hidden
            />
            <input
              id="location-map-place-search"
              type="search"
              autoComplete="off"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full h-10 rounded-lg border border-border pl-9 pr-3 text-sm bg-card"
            />
          </div>
          {searchLoading ? <p className="text-xs text-text-muted">Searching…</p> : null}
          {searchError ? <p className="text-xs text-error">{searchError}</p> : null}
          {searchResults.length > 0 ? (
            <ul
              className="max-h-48 overflow-y-auto rounded-lg border border-border divide-y divide-border bg-card"
              role="listbox"
              aria-label="Search results"
            >
              {searchResults.map((row, idx) => (
                <li key={`${row.lat},${row.lon},${idx}`}>
                  <button
                    type="button"
                    role="option"
                    onClick={() => pickSearchResult(row)}
                    className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-surface-alt transition-colors"
                  >
                    {row.display_name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className={showSearch ? "overflow-hidden rounded-b-xl" : "overflow-hidden rounded-xl"}>{mapBlock}</div>
      {!disabled ? (
        <p className="text-xs text-text-muted px-3 py-2.5 bg-card border-t border-border rounded-b-xl leading-relaxed">
          {showSearch
            ? "Pick a search result, tap the map, or drag the pin to set latitude and longitude."
            : "Click the map or drag the pin to set latitude and longitude."}
        </p>
      ) : null}
    </div>
  );
}
