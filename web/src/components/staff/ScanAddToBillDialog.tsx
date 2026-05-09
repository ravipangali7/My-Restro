import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Camera, Check, ListPlus, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { type PaymentAlertOrder } from "@/components/staff/payment-alert-types";
import { discountedUnitPrice } from "@/lib/pricing";
import type { DiscountType } from "@/constants/enums";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAddBillLine, useProductItems, useProducts, useScanBillItem, useUnits, type ScanBillItemResult } from "@/hooks/use-rest-api";
import { cn } from "@/lib/utils";

export type ScanAddSessionEvent = {
  at: string;
  orderId: number;
  orderIdLabel: string;
  lineLabel: string;
  source: "scan" | "manual" | "menu";
};

type ScanAddToBillDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId: number;
  openOrders: PaymentAlertOrder[];
  defaultOrderId: number | null;
  onItemAdded?: (e: ScanAddSessionEvent) => void;
};

function buildOrderLineLabel(o: PaymentAlertOrder): string {
  if (o.customer != null) {
    const a = o.customer_name?.trim() || "Customer";
    const p = o.customer_phone?.trim();
    return p ? `${a} · ${p}` : a;
  }
  const n = o.guest_customer_name?.trim();
  const p2 = o.guest_customer_phone?.trim();
  if (n && p2) return `${n} · ${p2}`;
  if (n) return n;
  if (p2) return p2;
  return o.order_id;
}

export function ScanAddToBillDialog({
  open,
  onOpenChange,
  restaurantId,
  openOrders,
  defaultOrderId,
  onItemAdded,
}: ScanAddToBillDialogProps) {
  const addLine = useAddBillLine();
  const scan = useScanBillItem();
  const { data: productItems = [] } = useProductItems(open ? restaurantId : null);
  const { data: products = [] } = useProducts(open ? restaurantId : null);
  const { data: units = [] } = useUnits(open ? restaurantId : null);

  const productItemOptions = useMemo(() => {
    const pBy = new Map((products as { id: number; name: string }[]).map((p) => [p.id, p.name]));
    const uBy = new Map(
      (units as { id: number; name: string; symbol: string }[]).map((u) => [u.id, u.symbol || u.name]),
    );
    return (productItems as { id: number; product: number; unit: number; price: string; discount_type: DiscountType; discount: string; is_active?: boolean }[])
      .filter((r) => r.is_active !== false)
      .map((pi) => {
        const pn = pBy.get(pi.product) ?? "Item";
        const sym = uBy.get(pi.unit) ?? "";
        const pNum = parseFloat(String(pi.price).replace(/,/g, ""));
        const disc = parseFloat(String(pi.discount).replace(/,/g, "")) || 0;
        const dUnit = discountedUnitPrice(
          Number.isFinite(pNum) ? pNum : 0,
          pi.discount_type,
          disc,
        );
        const label = sym ? `${pn} (${sym})` : pn;
        return { id: pi.id, label, listPrice: dUnit, raw: pi };
      });
  }, [productItems, products, units]);

  const [orderId, setOrderId] = useState<number | null>(null);
  const [mainTab, setMainTab] = useState<"scan" | "manual">("scan");
  const [name, setName] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [useCatalogId, setUseCatalogId] = useState<number | "">("");
  const [aiHint, setAiHint] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const orderSelectId = useId();

  useEffect(() => {
    if (!open) return;
    setName("");
    setUnitPrice("");
    setQuantity("1");
    setUseCatalogId("");
    setMainTab("scan");
    setAiHint(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (defaultOrderId != null && openOrders.some((o) => o.id === defaultOrderId)) {
      setOrderId(defaultOrderId);
    } else if (openOrders.length) {
      setOrderId((prev) => (prev != null && openOrders.some((o) => o.id === prev) ? prev : openOrders[0]!.id));
    } else {
      setOrderId(null);
    }
  }, [open, defaultOrderId, openOrders]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);
    setCameraReady(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      const msg = "This browser cannot access camera. Use HTTPS/localhost or switch to manual entry.";
      setCameraError(msg);
      toast.error(msg);
      return;
    }
    try {
      let s: MediaStream;
      try {
        s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
          audio: false,
        });
      } catch {
        // Fallback for devices/browsers that reject strict constraints.
        s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play().catch(() => undefined);
        if (videoRef.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          setCameraReady(true);
        }
      } else {
        setCameraReady(true);
      }
    } catch (e) {
      const msg = (e as Error).message || "Could not open the camera. Check permissions or use manual entry.";
      setCameraError(msg);
      toast.error(msg);
    }
  }, [stopCamera]);

  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }
    if (mainTab === "scan") {
      void startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [open, mainTab, startCamera, stopCamera]);

  const applyScanResult = (r: ScanBillItemResult) => {
    setName((r.item_name || "").trim() || "Unnamed item");
    if (r.estimated_price != null && Number.isFinite(r.estimated_price)) {
      setUnitPrice(r.estimated_price.toFixed(2));
    } else {
      setUnitPrice("");
    }
    setUseCatalogId("");
    if (r.suggested_menu_item) {
      setUseCatalogId(r.suggested_menu_item.product_item_id);
      setName(r.suggested_menu_item.label);
      const u = r.suggested_menu_item.unit_price;
      const n = parseFloat(String(u).replace(/,/g, ""));
      if (Number.isFinite(n)) setUnitPrice(n.toFixed(2));
    }
    setAiHint(
      r.detail
        ? r.detail
        : r.used_ai
          ? "Review the line before adding — you can still edit the name, price, or pick a menu match."
          : "Configure OPENAI_API_KEY on the server to enable automatic recognition; you can add manually anytime.",
    );
  };

  const onCapture = async () => {
    if (!orderId) {
      toast.error("Select an open bill first.");
      return;
    }
    const v = videoRef.current;
    if (!v || !v.videoWidth) {
      toast.error("Camera is not ready.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not capture image"))), "image/jpeg", 0.88);
    });
    try {
      const r = await scan.mutateAsync({ restaurantId, imageBlob: blob });
      applyScanResult(r);
      toast.success(r.used_ai ? "Item detected — confirm below." : "Add details below (AI not configured or failed).");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const submitAdd = async () => {
    if (!orderId) {
      toast.error("Select a bill to apply this line to.");
      return;
    }
    if (mainTab === "manual" && useCatalogId !== "" && useCatalogId != null) {
      try {
        const updated = (await addLine.mutateAsync({
          orderId,
          body: { product_item_id: Number(useCatalogId), quantity: quantity || "1" },
        })) as { order_id: string; items: { line_label?: string }[] };
        const last = updated.items?.length ? updated.items[updated.items.length - 1] : null;
        const lineLabel = last?.line_label ?? "Menu item";
        onItemAdded?.({
          at: new Date().toISOString(),
          orderId,
          orderIdLabel: updated.order_id,
          lineLabel,
          source: "menu",
        });
        toast.success("Added from menu");
        onOpenChange(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
      return;
    }
    const n = (name || "").trim();
    if (!n) {
      toast.error("Enter an item name.");
      return;
    }
    const up = parseFloat(String(unitPrice).replace(/,/g, ""));
    if (!Number.isFinite(up) || up < 0) {
      toast.error("Enter a valid unit price (₹).");
      return;
    }
    const q = parseFloat(String(quantity).replace(/,/g, ""));
    if (!Number.isFinite(q) || q <= 0) {
      toast.error("Enter a valid quantity.");
      return;
    }
    try {
      const updated = (await addLine.mutateAsync({
        orderId,
        body: { ad_hoc_label: n, unit_price: up.toFixed(2), quantity: q.toFixed(2) },
      })) as { order_id: string; items: { line_label?: string }[] };
      const last = updated.items?.length ? updated.items[updated.items.length - 1] : null;
      onItemAdded?.({
        at: new Date().toISOString(),
        orderId,
        orderIdLabel: updated.order_id,
        lineLabel: last?.line_label ?? n,
        source: mainTab === "manual" ? "manual" : "scan",
      });
      toast.success("Line added to the bill");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const o = openOrders.find((x) => x.id === orderId) ?? null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setAiHint(null);
        }
      }}
    >
      <DialogContent
        className={cn("max-w-lg gap-0 p-0 overflow-hidden", "max-h-[min(92dvh,880px)] flex flex-col")}
      >
        <div className="p-4 sm:p-5 border-b border-border shrink-0">
          <DialogHeader>
            <DialogTitle className="font-display">Scan &amp; add to bill</DialogTitle>
            <DialogDescription>
              Open the camera to detect a product, or add from your menu. Totals, discount, and delivery update on the
              same order as in the billing system.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-3 space-y-1.5">
            <Label htmlFor={orderSelectId} className="text-xs font-semibold text-text-muted">
              Bill to update
            </Label>
            <select
              id={orderSelectId}
              className="flex h-11 w-full rounded-xl border border-border bg-background px-3 text-sm shadow-sm"
              value={orderId ?? ""}
              onChange={(e) => setOrderId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="" disabled>
                {openOrders.length ? "Select…" : "No open bills in queue"}
              </option>
              {openOrders.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.order_id} — {buildOrderLineLabel(row)}
                </option>
              ))}
            </select>
            {openOrders.length === 0 ? (
              <p className="text-xs text-amber-900 dark:text-amber-100">No open bills in the queue. When an order appears, select it and add a line here.</p>
            ) : o ? (
              <p className="text-xs text-text-muted">Due after add will refresh; QR and cash use the new total.</p>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as typeof mainTab)} className="w-full">
            <TabsList className="grid w-full grid-cols-2 h-10 rounded-xl">
              <TabsTrigger value="scan" className="gap-1.5 rounded-lg text-sm">
                <Camera className="h-3.5 w-3.5" />
                Camera
              </TabsTrigger>
              <TabsTrigger value="manual" className="gap-1.5 rounded-lg text-sm">
                <ListPlus className="h-3.5 w-3.5" />
                Manual
              </TabsTrigger>
            </TabsList>
            <TabsContent value="scan" className="mt-3 space-y-3">
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-border bg-black/90">
                <video
                  ref={videoRef}
                  playsInline
                  className="h-full w-full object-contain"
                  muted
                  autoPlay
                  onLoadedData={() => setCameraReady(true)}
                  onPlaying={() => setCameraReady(true)}
                />
                {!cameraReady && (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
                    {open ? "Starting camera…" : null}
                  </div>
                )}
                {cameraError ? (
                  <div className="absolute inset-x-3 bottom-3 rounded-lg bg-red-950/70 px-3 py-2 text-xs text-red-100">
                    {cameraError}
                  </div>
                ) : null}
                {scan.isPending ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-white">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <span className="text-sm font-medium">Detecting product…</span>
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-xl gap-1.5"
                  onClick={() => void startCamera()}
                >
                  <RefreshCw className="h-4 w-4" />
                  Retake / restart camera
                </Button>
                <Button
                  type="button"
                  className="flex-1 min-w-[8rem] rounded-xl gap-1.5 h-11"
                  disabled={!orderId || scan.isPending || addLine.isPending}
                  onClick={() => void onCapture()}
                >
                  {scan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  Capture &amp; detect
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="manual" className="mt-3 space-y-3">
              <div className="space-y-1.5">
                <Label>Menu item (optional — uses catalog price &amp; matches billing)</Label>
                <select
                  className="flex h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  value={useCatalogId}
                  onChange={(e) => {
                    const v2 = e.target.value;
                    if (!v2) {
                      setUseCatalogId("");
                      return;
                    }
                    setUseCatalogId(Number(v2));
                    const it = productItemOptions.find((p) => p.id === Number(v2));
                    if (it) {
                      setName(it.label);
                      setUnitPrice(it.listPrice.toFixed(2));
                    }
                  }}
                >
                  <option value="">Ad-hoc line (use fields below)…</option>
                  {productItemOptions.map((pi) => (
                    <option key={pi.id} value={pi.id}>
                      {pi.label} @ ₹{pi.listPrice.toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-text-muted">Pick a menu row to use catalog pricing, or fill name and price for a one-off line.</p>
            </TabsContent>
          </Tabs>

          {aiHint ? <p className="text-xs text-amber-900 dark:text-amber-100 bg-amber-500/10 rounded-lg px-3 py-2">{aiHint}</p> : null}

          <div className="space-y-3 rounded-2xl border border-border p-3 bg-surface-alt/30">
            <p className="text-xs font-semibold uppercase text-text-muted">Confirm before adding</p>
            <div className="space-y-2">
              <Label htmlFor="adhoc-name">Item name</Label>
              <Input
                id="adhoc-name"
                className="rounded-xl h-10"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Nescafé 200g"
                autoComplete="off"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="u-price">Unit price (₹)</Label>
                <Input
                  id="u-price"
                  className="rounded-xl h-10 tabular-nums"
                  inputMode="decimal"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="u-qty">Quantity</Label>
                <Input
                  id="u-qty"
                  className="rounded-xl h-10 tabular-nums"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 sm:p-5 border-t border-border gap-2 flex flex-col sm:flex-row sm:justify-end shrink-0">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="rounded-xl w-full sm:w-auto gap-2 h-11"
            disabled={!orderId || addLine.isPending}
            onClick={() => void submitAdd()}
          >
            {addLine.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Add to bill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
