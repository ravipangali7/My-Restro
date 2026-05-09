import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Camera, Check, ListPlus, Loader2, RefreshCw, SwitchCamera } from "lucide-react";
import { toast } from "sonner";

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
import {
  useCreateRawMaterial,
  useScanRawMaterial,
  type ScanRawMaterialResult,
  useUnits,
} from "@/hooks/use-rest-api";
import { cn } from "@/lib/utils";

type CashierScanRawMaterialDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId: number;
};

export function CashierScanRawMaterialDialog({
  open,
  onOpenChange,
  restaurantId,
}: CashierScanRawMaterialDialogProps) {
  const scan = useScanRawMaterial();
  const createRm = useCreateRawMaterial();
  const { data: unitsRaw = [] } = useUnits(open ? restaurantId : null);

  const units = unitsRaw as { id: number; name: string; symbol: string }[];

  const nameId = useId();
  const unitIdField = useId();
  const priceId = useId();
  const qtyId = useId();
  const minStockId = useId();

  const [mainTab, setMainTab] = useState<"scan" | "manual">("scan");
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">("environment");
  const [name, setName] = useState("");
  const [unitId, setUnitId] = useState<string>("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [minStock, setMinStock] = useState("0");
  const [aiHint, setAiHint] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setUnitId("");
    setPrice("");
    setQuantity("1");
    setMinStock("0");
    setMainTab("scan");
    setCameraFacing("environment");
    setAiHint(null);
  }, [open]);

  const defaultUnitId = useMemo(() => {
    const first = units[0];
    return first ? String(first.id) : "";
  }, [units]);

  useEffect(() => {
    if (!open || unitId !== "") return;
    if (defaultUnitId) setUnitId(defaultUnitId);
  }, [open, unitId, defaultUnitId]);

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
      const msg = "This browser cannot access the camera. Use HTTPS/localhost or switch to manual entry.";
      setCameraError(msg);
      toast.error(msg);
      return;
    }
    try {
      let s: MediaStream;
      try {
        s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: cameraFacing }, width: { ideal: 1280 } },
          audio: false,
        });
      } catch {
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
  }, [stopCamera, cameraFacing]);

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

  const flipCamera = useCallback(() => {
    setCameraFacing((f) => (f === "environment" ? "user" : "environment"));
  }, []);

  const applyScanResult = (r: ScanRawMaterialResult) => {
    setName((r.item_name || "").trim() || "");
    if (r.estimated_price != null && Number.isFinite(r.estimated_price)) {
      setPrice(r.estimated_price.toFixed(2));
    } else {
      setPrice("");
    }
    if (r.suggested_unit_id != null && units.some((u) => u.id === r.suggested_unit_id)) {
      setUnitId(String(r.suggested_unit_id));
    } else {
      setUnitId(defaultUnitId);
    }
    setQuantity("1");
    const hintParts: string[] = [];
    if (r.detail) hintParts.push(r.detail);
    else if (r.used_ai) {
      hintParts.push("Review details before saving — adjust quantity, unit, or price as needed.");
    } else {
      hintParts.push(
        "Configure OPENAI_API_KEY on the server for automatic recognition; you can add manually anytime.",
      );
    }
    if (r.notes?.trim()) hintParts.push(r.notes.trim());
    if (r.existing_matches?.length) {
      hintParts.push(
        `Similar items already in inventory: ${r.existing_matches.map((m) => m.name).join(", ")} — avoid duplicate names if you mean a new SKU.`,
      );
    }
    setAiHint(hintParts.filter(Boolean).join(" "));
  };

  const onCapture = async () => {
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
      const okName = (r.item_name || "").trim().length > 0;
      toast.success(
        r.used_ai && okName ? "Ingredient detected — confirm below." : "Fill in details below or try another shot.",
      );
      if (!okName && mainTab === "scan") {
        setMainTab("manual");
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const submitSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a raw material name.");
      return;
    }
    if (!unitId) {
      toast.error("Select a unit. Ask an owner to define units if this list is empty.");
      return;
    }
    const pr = parseFloat(String(price).replace(/,/g, ""));
    if (!Number.isFinite(pr) || pr < 0) {
      toast.error("Enter a valid price (₹).");
      return;
    }
    const q = parseFloat(String(quantity).replace(/,/g, ""));
    if (!Number.isFinite(q) || q <= 0) {
      toast.error("Enter a valid quantity (stock to add).");
      return;
    }
    const ms = parseFloat(String(minStock).replace(/,/g, ""));
    if (!Number.isFinite(ms) || ms < 0) {
      toast.error("Enter a valid minimum stock.");
      return;
    }
    try {
      await createRm.mutateAsync({
        restaurantId,
        body: {
          name: trimmed,
          unit: Number.parseInt(unitId, 10),
          price: pr.toFixed(2),
          stock: q.toFixed(3),
          min_stock: ms.toFixed(3),
        },
      });
      toast.success("Raw material saved");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const noUnits = units.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("max-w-lg gap-0 p-0 overflow-hidden", "max-h-[min(92dvh,880px)] flex flex-col")}
      >
        <div className="shrink-0 border-b border-border p-4 sm:p-5">
          <DialogHeader>
            <DialogTitle className="font-display">Scan raw materials</DialogTitle>
            <DialogDescription>
              Photograph ingredients or supplies to fill name and price automatically when AI is enabled. Quantity
              defaults to 1 — adjust before saving. Use manual entry if recognition fails.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as typeof mainTab)} className="w-full">
            <TabsList className="grid h-10 w-full grid-cols-2 rounded-xl">
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
                {!cameraReady ? (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
                    {open ? "Starting camera…" : null}
                  </div>
                ) : null}
                {cameraError ? (
                  <div className="absolute inset-x-3 bottom-14 rounded-lg bg-red-950/70 px-3 py-2 text-xs text-red-100">
                    {cameraError}
                  </div>
                ) : null}
                <div className="absolute right-2 top-2 flex gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="size-10 rounded-full bg-black/50 text-white shadow-md backdrop-blur-sm hover:bg-black/65"
                    aria-label="Switch front and back camera"
                    onClick={() => flipCamera()}
                  >
                    <SwitchCamera className="size-5" />
                  </Button>
                </div>
                {scan.isPending ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-white">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <span className="text-sm font-medium">Identifying…</span>
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" className="gap-1.5 rounded-xl" onClick={() => void startCamera()}>
                  <RefreshCw className="h-4 w-4" />
                  Restart camera
                </Button>
                <Button
                  type="button"
                  className="h-11 min-w-[8rem] flex-1 gap-1.5 rounded-xl"
                  disabled={scan.isPending || createRm.isPending || noUnits}
                  onClick={() => void onCapture()}
                >
                  {scan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  Capture &amp; identify
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="manual" className="mt-3 space-y-2">
              <p className="text-sm text-text-muted">
                Enter everything by hand when the camera cannot identify the item or AI is unavailable.
              </p>
            </TabsContent>
          </Tabs>

          {noUnits ? (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-950 dark:text-amber-100">
              No units are defined for this restaurant. An owner must create units under inventory before you can save raw
              materials.
            </p>
          ) : null}

          {aiHint ? (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">{aiHint}</p>
          ) : null}

          <div className="space-y-3 rounded-2xl border border-border bg-surface-alt/30 p-3">
            <p className="text-xs font-semibold uppercase text-text-muted">Details</p>
            <div className="space-y-2">
              <Label htmlFor={nameId}>Name</Label>
              <Input
                id={nameId}
                className="h-10 rounded-xl"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Refined sunflower oil 1L"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={unitIdField}>Unit</Label>
              <select
                id={unitIdField}
                className="flex h-11 w-full rounded-xl border border-border bg-background px-3 text-sm shadow-sm"
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
              >
                <option value="" disabled>
                  Select unit…
                </option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {u.symbol ? ` (${u.symbol})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor={priceId}>Price per unit (₹)</Label>
                <Input
                  id={priceId}
                  className="h-10 rounded-xl tabular-nums"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label htmlFor={qtyId}>Stock quantity</Label>
                <Input
                  id={qtyId}
                  className="h-10 rounded-xl tabular-nums"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor={minStockId}>Minimum stock</Label>
              <Input
                id={minStockId}
                className="h-10 max-w-[50%] rounded-xl tabular-nums"
                inputMode="decimal"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 flex flex-col gap-2 border-t border-border p-4 sm:flex-row sm:justify-end sm:p-5">
          <Button type="button" variant="outline" className="w-full rounded-xl sm:w-auto" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="h-11 w-full gap-2 rounded-xl sm:w-auto"
            disabled={createRm.isPending || noUnits}
            onClick={() => void submitSave()}
          >
            {createRm.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save raw material
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
