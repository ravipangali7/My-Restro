import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Copy, Download, ExternalLink, Loader2, QrCode } from "lucide-react";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { getApiBaseUrl, getStoredToken } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

/** Matches `:root` in `styles.css` (MyRestro light theme) for print-friendly PDFs. */
const PDF_THEME = {
  foreground: [26, 26, 26] as const,
  textSecondary: [90, 90, 90] as const,
  textMuted: [154, 154, 154] as const,
  primary: [248, 50, 50] as const,
  primary50: [255, 241, 241] as const,
} as const;

/** Raster size for QR bitmap (high ECC + large modules → fast, reliable scans). */
const QR_PIXEL_SIZE = 768;

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

/** Avoid `crossOrigin` on blob/data URLs; use anonymous only for remote http(s) (same-origin relative URLs skip cors). */
function loadImageElementForComposite(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:\/\//i.test(src) || src.startsWith("//")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image failed to load."));
    img.src = src;
  });
}

function dataUrlToImage(dataUrl: string): Promise<HTMLImageElement> {
  return loadImageElementForComposite(dataUrl);
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
async function embedLogoCenterInQrPng(qrPngDataUrl: string, logoSrc: string | null, outSize: number): Promise<string> {
  if (!logoSrc) return qrPngDataUrl;
  try {
    const qrImg = await dataUrlToImage(qrPngDataUrl);
    const logoImg = await loadImageElementForComposite(logoSrc);
    const canvas = document.createElement("canvas");
    canvas.width = outSize;
    canvas.height = outSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) return qrPngDataUrl;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(qrImg, 0, 0, outSize, outSize);
    const patch = outSize * 0.22;
    const px = (outSize - patch) / 2;
    const py = (outSize - patch) / 2;
    ctx.fillStyle = "#ffffff";
    roundRectPath(ctx, px, py, patch, patch, Math.round(outSize * 0.03));
    ctx.fill();
    const inset = patch * 0.12;
    ctx.drawImage(logoImg, px + inset, py + inset, patch - inset * 2, patch - inset * 2);
    return canvas.toDataURL("image/png");
  } catch {
    return qrPngDataUrl;
  }
}

async function rasterizeImageSrcToPngDataUrl(src: string): Promise<string> {
  const img = await loadImageElementForComposite(src);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas context unavailable.");
  context.drawImage(img, 0, 0);
  return canvas.toDataURL("image/png");
}

function resolveMenuQrBaseUrl(): string {
  const raw = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "";
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
  const { token } = useAuth();
  const [isDownloading, setIsDownloading] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [menuBaseUrl, setMenuBaseUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrGenError, setQrGenError] = useState<string | null>(null);
  const [brandObjectUrl, setBrandObjectUrl] = useState<string | null>(null);
  const [brandLoading, setBrandLoading] = useState(false);
  const brandBlobRef = useRef<string | null>(null);

  useEffect(() => {
    setMenuBaseUrl(resolveMenuQrBaseUrl());
  }, []);

  const menuUrl = useMemo(() => {
    if (restaurantId == null || !menuBaseUrl) return null;
    return `${menuBaseUrl}/waiter-menu?restaurantId=${restaurantId}`;
  }, [restaurantId, menuBaseUrl]);

  useEffect(() => {
    if (!menuUrl) {
      setQrDataUrl(null);
      setQrGenError(null);
      return;
    }
    let cancelled = false;
    setQrGenError(null);
    void QRCode.toDataURL(menuUrl, {
      errorCorrectionLevel: "H",
      type: "image/png",
      margin: 4,
      width: QR_PIXEL_SIZE,
      color: { dark: "#1A1A1AFF", light: "#FFFFFFFF" },
    })
      .then((data) => {
        if (!cancelled) setQrDataUrl(data);
      })
      .catch(() => {
        if (!cancelled) {
          setQrDataUrl(null);
          setQrGenError("Could not generate QR code. Check your connection and try again.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [menuUrl]);

  useEffect(() => {
    const revokeBlobOnly = () => {
      const u = brandBlobRef.current;
      if (u) {
        URL.revokeObjectURL(u);
        brandBlobRef.current = null;
      }
    };

    if (!restaurantId || !restaurantLogoUrl?.trim()) {
      revokeBlobOnly();
      setBrandObjectUrl(null);
      setBrandLoading(false);
      return;
    }

    const authToken = token ?? getStoredToken();
    if (!authToken) {
      revokeBlobOnly();
      setBrandObjectUrl(null);
      setBrandLoading(false);
      return;
    }

    const apiBase = getApiBaseUrl().replace(/\/$/, "");
    const fetchUrl = `${apiBase}/api/restaurants/${restaurantId}/qr-brand-image/`;

    let cancelled = false;
    setBrandLoading(true);
    void fetch(fetchUrl, {
      headers: { Authorization: `Token ${authToken}`, Accept: "image/*" },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        revokeBlobOnly();
        const u = URL.createObjectURL(blob);
        brandBlobRef.current = u;
        setBrandObjectUrl(u);
      })
      .catch(() => {
        if (!cancelled) {
          revokeBlobOnly();
          setBrandObjectUrl(null);
        }
      })
      .finally(() => {
        if (!cancelled) setBrandLoading(false);
      });

    return () => {
      cancelled = true;
      revokeBlobOnly();
    };
  }, [restaurantId, restaurantLogoUrl, token]);

  const logoSrcForComposite = brandObjectUrl ?? (restaurantLogoUrl?.trim() ? restaurantLogoUrl : null);
  const hasLogoConfigured = Boolean(restaurantLogoUrl?.trim());
  const pdfDownloadBlockedByLogo = Boolean(hasLogoConfigured && brandLoading);

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

  const handleDownloadPdf = async () => {
    if (!menuUrl || !qrDataUrl || restaurantId == null || isDownloading) return;
    setIsDownloading(true);
    try {
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const centerX = pageWidth / 2;
      const marginX = 52;
      const contentW = pageWidth - marginX * 2;

      const [fgR, fgG, fgB] = PDF_THEME.foreground;
      const [secR, secG, secB] = PDF_THEME.textSecondary;
      const [mutedR, mutedG, mutedB] = PDF_THEME.textMuted;
      const [prR, prG, prB] = PDF_THEME.primary;
      const [p50R, p50G, p50B] = PDF_THEME.primary50;

      pdf.setFillColor(prR, prG, prB);
      pdf.rect(0, 0, pageWidth, 5, "F");

      let cursorY = 56;
      const headerLogoSize = 76;
      let headerLogoLoaded = false;
      const headerLogoCandidates = [brandObjectUrl, restaurantLogoUrl?.trim() || null].filter(Boolean) as string[];
      for (const src of headerLogoCandidates) {
        try {
          const logoData = await rasterizeImageSrcToPngDataUrl(src);
          pdf.addImage(logoData, "PNG", centerX - headerLogoSize / 2, cursorY, headerLogoSize, headerLogoSize);
          headerLogoLoaded = true;
          cursorY += headerLogoSize + 20;
          break;
        } catch {
          /* try next */
        }
      }

      if (!headerLogoLoaded) {
        const letter = (displayName.trim()[0] ?? "?").toUpperCase();
        const lx = centerX - headerLogoSize / 2;
        pdf.setFillColor(p50R, p50G, p50B);
        pdf.roundedRect(lx, cursorY, headerLogoSize, headerLogoSize, 16, 16, "F");
        pdf.setTextColor(prR, prG, prB);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(34);
        pdf.text(letter, centerX, cursorY + headerLogoSize / 2 + 12, { align: "center" });
        cursorY += headerLogoSize + 20;
      }

      pdf.setTextColor(fgR, fgG, fgB);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(20);
      const titleLines = pdf.splitTextToSize(displayName || "Menu", contentW);
      pdf.text(titleLines, centerX, cursorY, { align: "center" });
      cursorY += titleLines.length * 24 + 6;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      pdf.setTextColor(secR, secG, secB);
      const tag = "Scan to order · Add items with your name & phone — no app or login required";
      const tagLines = pdf.splitTextToSize(tag, contentW);
      pdf.text(tagLines, centerX, cursorY, { align: "center" });
      cursorY += tagLines.length * 14 + 28;

      const qrRaster =
        logoSrcForComposite != null
          ? await embedLogoCenterInQrPng(qrDataUrl, logoSrcForComposite, QR_PIXEL_SIZE)
          : qrDataUrl;

      const qrSize = 320;
      const panelPadY = 36;
      const panelPadX = 40;
      const panelW = Math.min(qrSize + panelPadX * 2, contentW);
      const panelH = qrSize + panelPadY * 2;
      const panelX = centerX - panelW / 2;

      pdf.setFillColor(p50R, p50G, p50B);
      pdf.roundedRect(panelX, cursorY, panelW, panelH, 18, 18, "F");

      const qrX = centerX - qrSize / 2;
      const qrY = cursorY + panelPadY;
      pdf.addImage(qrRaster, "PNG", qrX, qrY, qrSize, qrSize);

      cursorY += panelH + 28;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(mutedR, mutedG, mutedB);
      const hint = "Tip: Print at 100% scale for reliable scanning.";
      pdf.text(hint, centerX, cursorY, { align: "center" });
      cursorY += 16;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9.5);
      pdf.setTextColor(secR, secG, secB);
      const wrappedUrl = pdf.splitTextToSize(menuUrl, contentW - 8);
      pdf.text(wrappedUrl, centerX, cursorY, { align: "center" });
      cursorY += wrappedUrl.length * 12 + 8;

      try {
        const origin = new URL(menuUrl).origin.replace(/^https?:\/\//, "");
        pdf.setFontSize(8.5);
        pdf.setTextColor(mutedR, mutedG, mutedB);
        pdf.text(origin, centerX, pageHeight - 40, { align: "center" });
      } catch {
        /* ignore */
      }

      pdf.save(`menu-qr-${restaurantId}.pdf`);
    } finally {
      setIsDownloading(false);
    }
  };

  const showQrWorkspace = Boolean(restaurantId && menuUrl && qrDataUrl);
  const showGenerating = Boolean(restaurantId && menuUrl && !qrDataUrl && !qrGenError);
  const showQrError = Boolean(restaurantId && qrGenError);
  const waitingOrigin = Boolean(restaurantId && !menuBaseUrl);

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

      {!restaurantId ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-text-muted">
          Select a restaurant to generate its menu QR.
        </div>
      ) : waitingOrigin ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-10 text-sm text-text-secondary">
          <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
          Preparing menu link…
        </div>
      ) : showQrError ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-error">{qrGenError}</div>
      ) : showGenerating ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-10 text-sm text-text-secondary">
          <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
          Generating QR…
        </div>
      ) : showQrWorkspace ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <div className="rounded-2xl bg-primary-50/70 p-5">
              <div className="mx-auto flex w-full max-w-[280px] flex-col items-center">
                <div className="relative w-full rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-black/[0.04]">
                  <img
                    src={qrDataUrl}
                    alt={`Menu QR for ${restaurantName ?? `restaurant ${restaurantId}`}`}
                    className="block h-auto w-full rounded-xl"
                  />
                  {logoSrcForComposite ? (
                    <div
                      className="pointer-events-none absolute left-1/2 top-1/2 flex size-[20%] min-h-[44px] min-w-[44px] max-h-[72px] max-w-[72px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-black/[0.06]"
                      aria-hidden
                    >
                      <img src={logoSrcForComposite} alt="" className="size-[78%] rounded-md object-cover" />
                    </div>
                  ) : null}
                </div>
                {displayName ? (
                  <p className="mt-3 px-1 text-center font-display text-sm font-bold leading-snug text-foreground">
                    {displayName}
                  </p>
                ) : null}
                {hasLogoConfigured && !brandObjectUrl ? (
                  <p className="mt-2 text-center text-[11px] text-text-muted">Loading logo for print-quality export…</p>
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
              <p className="mt-2 text-xs text-text-muted">
                Set <span className="font-mono text-foreground">VITE_PUBLIC_APP_URL</span> (e.g.{" "}
                <span className="font-mono">https://mithobasai.com</span>) so printed QR codes always open your live
                site, even if you generate them from another host.
              </p>
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
                  disabled={isDownloading || pdfDownloadBlockedByLogo}
                  title={
                    pdfDownloadBlockedByLogo ? "Wait for the logo to finish loading so it can be embedded in the PDF." : undefined
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/60 disabled:opacity-50"
                >
                  <Download className="size-4" />
                  {isDownloading
                    ? "Preparing PDF..."
                    : pdfDownloadBlockedByLogo
                      ? "Preparing logo…"
                      : "Download PDF"}
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
      ) : null}
    </div>
  );
}
