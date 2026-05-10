/**
 * API origin for fetch() and `resolveMediaUrl()` (e.g. `https://api.example.com/media/...`).
 * Empty string = same-origin (`/api/...`, `/media/...`).
 * - Dev: Vite proxies `/api` and `/media` to Django (vite.config.ts).
 * - Prod: set `VITE_API_BASE_URL` to your API host so JSON + media both hit Django (avoids broken
 *   `/media` when the SPA is served from a different domain than the API).
 * Bare hostnames (`api.example.com`) are normalized to `https://api.example.com`.
 */
function normalizeApiOrigin(raw: string | undefined): string {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const noTrailingSlash = s.replace(/\/+$/, "");
  if (/^https?:\/\//i.test(noTrailingSlash)) return noTrailingSlash;
  return `https://${noTrailingSlash}`;
}

function resolveApiBaseUrl(): string {
  const fromEnv = normalizeApiOrigin(import.meta.env.VITE_API_BASE_URL as string | undefined);
  if (fromEnv) return fromEnv;
  return "";
}

const API_BASE_URL = resolveApiBaseUrl();

const TOKEN_KEY = "myrestro_token";

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

/** Turn API image paths into a usable URL (handles absolute URLs from DRF). */
export function resolveMediaUrl(path: string | null | undefined): string | null {
  if (path == null) return null;
  const raw = String(path).trim();
  if (raw === "") return null;

  // Protocol-relative URLs (`//host/...`) — browsers need an explicit scheme.
  if (raw.startsWith("//")) {
    const scheme =
      typeof window !== "undefined" && window.location?.protocol === "http:" ? "http:" : "https:";
    return `${scheme}${raw}`;
  }

  let resolved = raw;
  // Avoid mixed-content blocking when the API returns `http://` on an HTTPS site.
  if (
    resolved.startsWith("http://") &&
    typeof window !== "undefined" &&
    window.location?.protocol === "https:"
  ) {
    resolved = `https://${resolved.slice("http://".length)}`;
  }

  if (resolved.startsWith("http://") || resolved.startsWith("https://")) return resolved;

  const base = API_BASE_URL.replace(/\/$/, "");
  let p = resolved.startsWith("/") ? resolved : `/${resolved}`;
  // Raw queryset `.values("image")` (e.g. client home) returns the path relative to MEDIA_ROOT
  // (`products/…`, `categories/…`). DRF often returns `media/…` or a full URL. Files are served
  // under Django's MEDIA_URL (`/media/…` on this project).
  if (!p.startsWith("/media/")) {
    p = `/media${p}`;
  }
  return `${base}${p}`;
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** Maps failed `/api/auth/request-otp/` responses to a concise message (avoids raw API SMS config text). */
export function formatRequestOtpSendError(error: unknown): string {
  if (error instanceof ApiError && error.status === 503) {
    if (import.meta.env.DEV) {
      return "SMS could not be sent from the API. Enable DJANGO_DEBUG, SMS_OTP_DEV_AUTO_FALLBACK, or Twilio on the server, then try again.";
    }
    return "SMS could not be sent from the server. Contact support or your administrator.";
  }
  return error instanceof Error ? error.message : "Could not send OTP.";
}

function httpErrorMessage(errBody: string, status: number): string {
  const fallback = errBody || `API request failed with status ${status}`;
  try {
    const parsed = JSON.parse(errBody) as { detail?: unknown };
    if (typeof parsed.detail === "string") return parsed.detail;
    if (Array.isArray(parsed.detail)) {
      const parts = parsed.detail.map((d) => (typeof d === "string" ? d : JSON.stringify(d)));
      if (parts.length) return parts.join(" ");
    }
  } catch {
    /* use fallback */
  }
  return fallback;
}

/**
 * @param token Auth token, or `undefined` to fall back to stored token, or `null` for an unauthenticated request
 * (no Authorization header, even if a token exists in storage — used for public menu QR checkout and public listings).
 */
function authHeaders(token: string | null | undefined): HeadersInit {
  const headers: Record<string, string> = { Accept: "application/json" };
  const t = token === undefined ? getStoredToken() : token;
  if (t) headers.Authorization = `Token ${t}`;
  return headers;
}

export async function apiGet<T>(path: string, token?: string | null): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { headers: authHeaders(token) });
  if (response.status === 401) {
    setStoredToken(null);
    throw new Error("Unauthorized");
  }
  if (!response.ok) {
    const errBody = await response.text();
    throw new ApiError(httpErrorMessage(errBody, response.status), response.status, errBody);
  }
  return (await response.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown, token?: string | null): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.status === 401) {
    setStoredToken(null);
    throw new Error("Unauthorized");
  }
  if (!response.ok) {
    const errBody = await response.text();
    throw new ApiError(httpErrorMessage(errBody, response.status), response.status, errBody);
  }
  return (await response.json()) as T;
}

export async function apiPatch<T>(path: string, body: unknown, token?: string | null): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "PATCH",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.status === 401) {
    setStoredToken(null);
    throw new Error("Unauthorized");
  }
  if (!response.ok) {
    const errBody = await response.text();
    throw new ApiError(httpErrorMessage(errBody, response.status), response.status, errBody);
  }
  return (await response.json()) as T;
}

/** Multipart POST (e.g. file upload). Do not set Content-Type; the browser sets the boundary. */
export async function apiPostForm<T>(path: string, formData: FormData, token?: string | null): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: authHeaders(token),
    body: formData,
  });
  if (response.status === 401) {
    setStoredToken(null);
    throw new Error("Unauthorized");
  }
  if (!response.ok) {
    const errBody = await response.text();
    throw new ApiError(httpErrorMessage(errBody, response.status), response.status, errBody);
  }
  return (await response.json()) as T;
}

/** Multipart PATCH (e.g. image update). */
export async function apiPatchForm<T>(path: string, formData: FormData, token?: string | null): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: formData,
  });
  if (response.status === 401) {
    setStoredToken(null);
    throw new Error("Unauthorized");
  }
  if (!response.ok) {
    const errBody = await response.text();
    throw new ApiError(httpErrorMessage(errBody, response.status), response.status, errBody);
  }
  return (await response.json()) as T;
}

export async function apiDelete(path: string, token?: string | null): Promise<void> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (response.status === 401) {
    setStoredToken(null);
    throw new Error("Unauthorized");
  }
  if (!response.ok) {
    const errBody = await response.text();
    throw new ApiError(httpErrorMessage(errBody, response.status), response.status, errBody);
  }
}
