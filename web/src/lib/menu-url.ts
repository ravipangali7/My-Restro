/** Public guest menu URL: `/menu/{slug}` on the app origin or VITE_PUBLIC_APP_URL. */
export function buildPublicMenuUrl(baseUrl: string, restaurantSlug: string): string {
  const origin = baseUrl.replace(/\/+$/, "");
  const slug = restaurantSlug.trim();
  return `${origin}/menu/${encodeURIComponent(slug)}`;
}

export function resolvePublicMenuBaseUrl(): string {
  const raw = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "";
}
