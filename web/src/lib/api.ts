const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") || "http://127.0.0.1:8000";

const TOKEN_KEY = "myrestro_token";

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

/** Turn API image paths into a usable URL (handles absolute URLs from DRF). */
export function resolveMediaUrl(path: string | null | undefined): string | null {
  if (path == null || path === "") return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = API_BASE_URL.replace(/\/$/, "");
  let p = path.startsWith("/") ? path : `/${path}`;
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

function authHeaders(token: string | null | undefined): HeadersInit {
  const headers: Record<string, string> = { Accept: "application/json" };
  const t = token ?? getStoredToken();
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
    throw new Error(httpErrorMessage(errBody, response.status));
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
    throw new Error(httpErrorMessage(errBody, response.status));
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
    throw new Error(httpErrorMessage(errBody, response.status));
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
    throw new Error(httpErrorMessage(errBody, response.status));
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
    throw new Error(httpErrorMessage(errBody, response.status));
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
    throw new Error(httpErrorMessage(errBody, response.status));
  }
}
