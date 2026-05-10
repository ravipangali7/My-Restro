import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useSuperSettings, useUpdateSuperSettings } from "@/hooks/use-rest-api";
import { resolveMediaUrl } from "@/lib/api";
import type { SuperSettingsDTO } from "@/lib/super-settings-cache";

export const Route = createFileRoute("/superadmin/settings")({
  component: SettingsPage,
});

function toNum(v: string | number | undefined): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function SettingsPage() {
  const { data: s, isLoading, isPlaceholderData } = useSuperSettings();
  const update = useUpdateSuperSettings();
  const settings = s as SuperSettingsDTO | undefined;

  const [subscriptionFee, setSubscriptionFee] = useState("");
  const [perTx, setPerTx] = useState("");
  const [dueThreshold, setDueThreshold] = useState("");
  const [smsCost, setSmsCost] = useState("");
  const [dueQrFile, setDueQrFile] = useState<File | null>(null);
  const dueQrInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!settings) return;
    setSubscriptionFee(String(toNum(settings.subscription_fee_per_month)));
    setPerTx(String(toNum(settings.per_transaction_fee)));
    setDueThreshold(String(toNum(settings.due_threshold)));
    setSmsCost(String(toNum(settings.sms_per_usage)));
    setDueQrFile(null);
  }, [settings]);

  const errMsg = update.error instanceof Error ? update.error.message : update.isError ? "Save failed." : null;

  const [savedFlash, setSavedFlash] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      subscription_fee_per_month: Number(subscriptionFee),
      per_transaction_fee: Number(perTx),
      due_threshold: Number(dueThreshold),
      sms_per_usage: Number(smsCost),
      due_payment_qr: dueQrFile,
    };
    update.mutate(payload, {
      onSuccess: () => {
        setDueQrFile(null);
        if (dueQrInputRef.current) dueQrInputRef.current.value = "";
        setSavedFlash(true);
        window.setTimeout(() => setSavedFlash(false), 4000);
      },
    });
  };

  if (isLoading && !isPlaceholderData && !settings) {
    return <p className="text-sm text-text-muted">Loading settings…</p>;
  }
  if (!settings && !isPlaceholderData) {
    return <p className="text-sm text-text-muted">Loading settings…</p>;
  }
  const display = settings as SuperSettingsDTO;
  const dueQrSrc = resolveMediaUrl(display.due_payment_qr ?? null);

  return (
    <>
      <h2 className="font-display font-semibold text-lg text-foreground mb-4">Platform Settings</h2>
      <form onSubmit={onSubmit} className="bg-card rounded-xl border border-border p-5 max-w-lg">
        <h3 className="font-display font-semibold text-md text-foreground mb-4">Super Settings</h3>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-text-secondary mb-1.5 block">Subscription Fee / Month (₹)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={subscriptionFee}
              onChange={(e) => setSubscriptionFee(e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
            />
            <p className="mt-1 text-xs text-text-muted">
              Default monthly subscription reference for venues that do not have their own rate set on the restaurant record.
              Individual restaurant overrides always take precedence.
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-text-secondary mb-1.5 block">Per Transaction Fee (₹)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={perTx}
              onChange={(e) => setPerTx(e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
            />
            <p className="mt-1 text-xs text-text-muted">
              Default flat fee per order for venues whose per-transaction fee is zero (not individually set). If a restaurant has
              a positive custom per-transaction fee, that fee is charged instead and this global value does not apply.
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-text-secondary mb-1.5 block">Due Threshold (₹)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={dueThreshold}
              onChange={(e) => setDueThreshold(e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
            />
            <p className="mt-1 text-xs text-text-muted">
              When a restaurant&apos;s due balance reaches or exceeds this amount (and the threshold is greater than
              zero), the venue is set inactive: it disappears from the customer portal until dues are cleared.
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-text-secondary mb-1.5 block">SMS Usage Cost (₹)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={smsCost}
              onChange={(e) => setSmsCost(e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
            />
            <p className="mt-1 text-xs text-text-muted">
              Default rate per successful billable SMS for venues without a custom SMS rate. Saved value:{" "}
              <span className="font-mono text-foreground">
                ₹{toNum(display.sms_per_usage).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              . Staff login OTP and order-status SMS use each restaurant&apos;s custom rate when set; owner login OTP and
              superadmin SMS campaigns use this global rate. Updates apply as soon as you save; restaurant lists refetch so
              owner screens show current effective rates.
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-text-secondary mb-1.5 block">Platform Balance</label>
            <input
              type="text"
              value={`₹${toNum(display.balance).toLocaleString()}`}
              readOnly
              className="w-full h-11 px-4 rounded-xl border border-border bg-surface-alt text-sm text-text-muted outline-none"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-text-secondary mb-1.5 block">Due payment QR</label>
            <p className="text-xs text-text-muted mb-2">
              Restaurant owners see this QR when paying platform dues; due settlement is blocked until this image is
              set.
            </p>
            <input
              ref={dueQrInputRef}
              type="file"
              accept="image/*"
              className="w-full text-sm text-text-secondary file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setDueQrFile(f ?? null);
              }}
            />
            {dueQrFile ? (
              <p className="mt-1 text-xs text-text-muted">New file selected — it will upload when you save settings.</p>
            ) : dueQrSrc ? (
              <div className="mt-3 inline-block rounded-xl border border-border bg-white p-2">
                <img src={dueQrSrc} alt="Current due payment QR" className="max-h-40 w-auto max-w-full object-contain" />
              </div>
            ) : (
              <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">No QR uploaded yet.</p>
            )}
          </div>
        </div>
        {savedFlash && (
          <p className="mt-4 text-sm text-emerald-600 dark:text-emerald-400" role="status">
            Settings saved.
          </p>
        )}
        {errMsg && (
          <p className="mt-4 text-sm text-error" role="alert">
            {errMsg}
          </p>
        )}
        <button
          type="submit"
          disabled={update.isPending}
          className="mt-6 h-11 px-6 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary-600 transition-all disabled:opacity-60"
        >
          {update.isPending ? "Saving…" : "Save Settings"}
        </button>
      </form>
    </>
  );
}
