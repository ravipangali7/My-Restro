const SUPER_KEY = "myrestro_super_settings";
const PLATFORM_KEY = "myrestro_platform_defaults";

export type SuperSettingsDTO = {
  id: number;
  subscription_fee_per_month: string | number;
  per_transaction_fee: string | number;
  due_threshold: string | number;
  sms_per_usage: string | number;
  balance: string | number;
  /** Relative or absolute URL/path to the platform due-payment QR image. */
  due_payment_qr?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type PlatformDefaultsDTO = {
  subscription_fee_per_month: string | number;
  per_transaction_fee: string | number;
  due_threshold: string | number;
  sms_per_usage: string | number;
  due_payment_qr?: string | null;
};

export function readSuperSettingsCache(): SuperSettingsDTO | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SUPER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SuperSettingsDTO;
  } catch {
    return null;
  }
}

export function cacheSuperSettings(data: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SUPER_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota */
  }
}

export function readPlatformDefaultsCache(): PlatformDefaultsDTO | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PLATFORM_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PlatformDefaultsDTO;
  } catch {
    return null;
  }
}

export function cachePlatformDefaults(data: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PLATFORM_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota */
  }
}
