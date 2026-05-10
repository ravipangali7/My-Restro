import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Copy, Download, ExternalLink, QrCode } from "lucide-react";
import { jsPDF } from "jspdf";

type MenuQrPageProps = {
  title: string;
  subtitle: string;
  backTo: string;
  backLabel: string;
  restaurantId: number | null;
  restaurantName?: string;
  restaurantLogoUrl?: string | null;
};

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* try fallback */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image failed to load."));
    img.src = src;
  });
}

function dataUrlToImage(dataUrl: string): Promise<HTMLImageElement> {
  return loadImageElement(dataUrl);
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Draws the QR bitmap and places a small logo on a white patch in the center (for PDF / print). */
async function embedLogoCenterInQrPng(qrPngDataUrl: string, logoUrl: string | null, outSize: number): Promise<string> {
  if (!logoUrl) return qrPngDataUrl;
  try {
    const qrImg = await dataUrlToImage(qrPngDataUrl);
    const logoImg = await loadImageElement(logoUrl);
    const canvas = document.createElement("canvas");
    canvas.width = outSize;
    canvas.height = outSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) return qrPngDataUrl;
    ctx.drawImage(qrImg, 0, 0, outSize, outSize);
    const patch = outSize * 0.24;
    const px = (outSize - patch) / 2;
    const py = (outSize - patch) / 2;
    ctx.fillStyle = "#ffffff";
    roundRectPath(ctx, px, py, patch, patch, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.lineWidth = Math.max(1, outSize / 300);
    ctx.stroke();
    const inset = patch * 0.13;
    ctx.drawImage(logoImg, px + inset, py + inset, patch - inset * 2, patch - inset * 2);
    return canvas.toDataURL("image/png");
  } catch {
    return qrPngDataUrl;
  }
}

export function MenuQrPage({
  title,
  subtitle,
  backTo,
  backLabel,
  restaurantId,
  restaurantName,
  restaurantLogoUrl,
}: MenuQrPageProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  const menuUrl = useMemo(() => {
    if (restaurantId == null) return null;
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/waiter-menu?restaurantId=${restaurantId}`;
  }, [restaurantId]);

  const qrImageUrl = useMemo(() => {
    if (!menuUrl) return null;
    const encoded = encodeURIComponent(menuUrl);
    return `https://api.qrserver.com/v1/create-qr-code/?size=640x640&margin=24&data=${encoded}`;
  }, [menuUrl]);

  const displayName = restaurantName?.trim() || (restaurantId != null ? `Restaurant ${restaurantId}` : "");

  const handleCopyLink = async () => {
    if (!menuUrl) return;
    setCopyStatus("idle");
    const ok = await copyTextToClipboard(menuUrl);
    setCopyStatus(ok ? "copied" : "failed");
    if (ok) {
      window.setTimeout(() => setCopyStatus("idle"), 2500);
    }
  };

  const loadImageDataUrl = (src: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Canvas context unavailable."));
          return;
        }
        context.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => reject(new Error("Image failed to load."));
      img.src = src;
    });

  const handleDownloadPdf = async () => {
    if (!menuUrl || !qrImageUrl || restaurantId == null || isDownloading) return;
    setIsDownloading(true);
    try {
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const centerX = pageWidth / 2;

      let cursorY = 72;
      if (restaurantLogoUrl) {
        try {
          const logoData = await loadImageDataUrl(restaurantLogoUrl);
          const logoSize = 64;
          pdf.addImage(logoData, "PNG", centerX - logoSize / 2, cursorY, logoSize, logoSize);
          cursorY += logoSize + 14;
        } catch {
          // Continue without header logo if loading fails due to missing image/CORS.
        }
      }

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(22);
      pdf.text(displayName, centerX, cursorY, { align: "center" });
      cursorY += 18;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      pdf.setTextColor(90, 90, 90);
      pdf.text("Scan to view menu", centerX, cursorY + 8, { align: "center" });
      pdf.setTextColor(0, 0, 0);

      const qrDataRaw = await loadImageDataUrl(qrImageUrl);
      const qrData =
        restaurantLogoUrl != null && restaurantLogoUrl !== ""
          ? await embedLogoCenterInQrPng(qrDataRaw, restaurantLogoUrl, 640)
          : qrDataRaw;
      const qrSize = 300;
      const qrY = cursorY + 28;
      pdf.addImage(qrData, "PNG", centerX - qrSize / 2, qrY, qrSize, qrSize);

      const linkY = qrY + qrSize + 24;
      pdf.setFontSize(10);
      pdf.setTextColor(70, 70, 70);
      const wrappedUrl = pdf.splitTextToSize(menuUrl, pageWidth - 96);
      pdf.text(wrappedUrl, centerX, linkY, { align: "center" });

      pdf.save(`menu-qr-${restaurantId}.pdf`);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-14 size-44 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative">
          <Link to={backTo} className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-foreground">
            {backLabel}
          </Link>
          <h1 className="mt-3 font-display text-2xl font-bold text-foreground">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">{subtitle}</p>
          {restaurantName ? <p className="mt-3 text-sm font-semibold text-foreground">Restaurant: {restaurantName}</p> : null}
        </div>
      </div>

      {!restaurantId || !menuUrl || !qrImageUrl ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-text-muted">
          Select a restaurant to generate its menu QR.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <div className="rounded-2xl border border-dashed border-primary/35 bg-primary-50/40 p-4">
              <div className="mx-auto flex w-full max-w-[280px] flex-col items-center">
                <div className="relative w-full rounded-xl bg-white p-2 shadow-sm">
                  <img
                    src={qrImageUrl}
                    alt={`Menu QR for ${restaurantName ?? `restaurant ${restaurantId}`}`}
                    className="block h-auto w-full rounded-lg"
                  />
                  {restaurantLogoUrl ? (
                    <div
                      className="pointer-events-none absolute left-1/2 top-1/2 flex size-[22%] min-h-[44px] min-w-[44px] max-h-[72px] max-w-[72px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl border border-black/10 bg-white shadow-sm"
                      aria-hidden
                    >
                      <img
                        src={restaurantLogoUrl}
                        alt=""
                        className="size-[78%] rounded-md object-cover"
                      />
                    </div>
                  ) : null}
                </div>
                {displayName ? (
                  <p className="mt-3 px-1 text-center font-display text-sm font-bold leading-snug text-foreground">
                    {displayName}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
                  <QrCode className="size-4.5" />
                </span>
                <div>
                  <h2 className="font-display text-lg font-semibold text-foreground">Menu QR</h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    Place this QR on tables, the counter, or packaging. The link stays the same over time: scanning it
                    opens the menu so guests can order with their name and phone—no login or app install required.
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-xl border border-border bg-muted/20 px-3 py-2 text-sm text-text-secondary break-all">
                {menuUrl}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyLink()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/60"
                >
                  <Copy className="size-4" />
                  {copyStatus === "copied" ? "Copied!" : copyStatus === "failed" ? "Copy failed" : "Copy link"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownloadPdf()}
                  disabled={isDownloading}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/60"
                >
                  <Download className="size-4" />
                  {isDownloading ? "Preparing PDF..." : "Download PDF"}
                </button>
                <a
                  href={menuUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  <ExternalLink className="size-4" />
                  Open menu
                </a>
              </div>
              {copyStatus === "failed" ? (
                <p className="mt-2 text-xs text-error">
                  Clipboard is blocked in this browser context. Select the URL above and copy manually, or try HTTPS.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
