import { getApiBaseUrl, getStoredToken } from "@/lib/api";

export async function fetchOrderBillImage(orderId: number): Promise<Blob> {
  const token = getStoredToken();
  const res = await fetch(`${getApiBaseUrl()}/api/orders/${orderId}/bill-image/`, {
    headers: {
      Accept: "image/png",
      ...(token ? { Authorization: `Token ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    let detail = text || `Request failed (${res.status})`;
    try {
      const parsed = JSON.parse(text) as { detail?: unknown };
      if (typeof parsed.detail === "string") detail = parsed.detail;
    } catch {
      /* keep body */
    }
    throw new Error(detail);
  }
  return res.blob();
}

export function downloadOrderBillBlob(blob: Blob, orderIdLabel: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${orderIdLabel.replace(/\//g, "-")}-bill.png`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadOrderBillImage(orderId: number, orderIdLabel: string): Promise<void> {
  const blob = await fetchOrderBillImage(orderId);
  downloadOrderBillBlob(blob, orderIdLabel);
}
