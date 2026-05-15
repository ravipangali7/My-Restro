/** Matches server `core.auth.portal.LOCAL_PHONE_DIGITS`: local numbers only, no country code. */
export const LOCAL_PHONE_DIGITS = 10;

export type LocalPhoneResult =
  | { ok: true; digits: string }
  | { ok: false; message: string };

/**
 * Validates a local mobile-style number: exactly LOCAL_PHONE_DIGITS digits, no leading +.
 * When `required` is false, an empty value succeeds with digits "".
 */
export function parseLocalPhone(raw: string, opts?: { required?: boolean }): LocalPhoneResult {
  const required = opts?.required !== false;
  const stripped = (raw ?? "").trim();
  if (!stripped) {
    if (!required) return { ok: true, digits: "" };
    return { ok: false, message: "Phone is required." };
  }
  if (stripped.startsWith("+")) {
    return { ok: false, message: "Do not include a country code. Enter exactly 10 digits (no + sign)." };
  }
  const digits = stripped.replace(/\D/g, "");
  if (digits.length !== LOCAL_PHONE_DIGITS) {
    return { ok: false, message: `Phone must be exactly ${LOCAL_PHONE_DIGITS} digits with no country code.` };
  }
  return { ok: true, digits };
}
