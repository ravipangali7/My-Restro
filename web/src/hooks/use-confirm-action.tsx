import { useCallback, useRef, useState, type ReactNode } from "react";
import { ConfirmModal } from "@/components/shared/ConfirmModal";

export type ConfirmActionOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
  onConfirm: () => void | Promise<void>;
};

const STATUS_LABELS: Record<string, string> = {
  accepted: "Accepted",
  running: "Running",
  ready: "Ready",
  waiting_pickup: "Waiting pickup",
  delivered: "Delivered",
  rejected: "Rejected",
  pending: "Pending",
};

export function formatConfirmStatus(status: string): string {
  const key = status.trim().toLowerCase();
  return STATUS_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function orderStatusConfirmMessage(orderLabel: string, nextStatus: string): string {
  return `Change order ${orderLabel} to “${formatConfirmStatus(nextStatus)}”? The customer may receive an SMS when a phone is on file.`;
}

export function useConfirmAction() {
  const [pending, setPending] = useState<ConfirmActionOptions | null>(null);
  const [busy, setBusy] = useState(false);
  const onConfirmRef = useRef<(() => void | Promise<void>) | null>(null);

  const requestConfirm = useCallback((options: ConfirmActionOptions) => {
    onConfirmRef.current = options.onConfirm;
    setPending(options);
  }, []);

  const close = useCallback(() => {
    if (busy) return;
    setPending(null);
    onConfirmRef.current = null;
  }, [busy]);

  const handleConfirm = useCallback(async () => {
    const fn = onConfirmRef.current;
    if (!fn || busy) return;
    setBusy(true);
    try {
      await fn();
      setPending(null);
      onConfirmRef.current = null;
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const ConfirmDialog: ReactNode = pending ? (
    <ConfirmModal
      open
      title={pending.title}
      message={pending.message}
      confirmLabel={pending.confirmLabel}
      cancelLabel={pending.cancelLabel}
      variant={pending.variant}
      confirmDisabled={busy}
      onConfirm={() => void handleConfirm()}
      onCancel={close}
    />
  ) : null;

  return { requestConfirm, ConfirmDialog, isConfirmBusy: busy };
}
