import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useAuth, type AuthUser } from "@/lib/auth-context";
import { User, Phone, TrendingUp, LogOut, Save } from "lucide-react";
import { apiPatch, apiPatchForm, resolveMediaUrl } from "@/lib/api";
import { ConfirmModal } from "@/components/shared/ConfirmModal";

export const Route = createFileRoute("/shareholder/profile")({
  component: ShareholderProfile,
});

function formatInr(amount: string | undefined): string {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return "—";
  return `₹${n.toLocaleString()}`;
}

function formatSharePct(pct: string | undefined): string {
  const n = Number(pct ?? 0);
  if (!Number.isFinite(n)) return "—";
  const text = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
  return `${text}%`;
}

function ShareholderProfile() {
  const { userName, phone, logout, user, token, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [phoneInput, setPhoneInput] = useState(user?.phone ?? "");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarBust, setAvatarBust] = useState(0);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(user?.name ?? "");
    setPhoneInput(user?.phone ?? "");
  }, [user?.name, user?.phone]);

  useEffect(() => {
    if (!saveSuccess) return;
    const t = window.setTimeout(() => setSaveSuccess(false), 2500);
    return () => window.clearTimeout(t);
  }, [saveSuccess]);

  const shareLabel = user ? formatSharePct(user.share_percentage) : "—";
  const balanceLabel = user ? formatInr(user.balance) : "—";
  const dueLabel = user ? formatInr(user.due_balance) : "—";

  const baseAvatarUrl = resolveMediaUrl(user?.image ?? null);
  const avatarUrl =
    baseAvatarUrl && avatarBust > 0
      ? `${baseAvatarUrl}${baseAvatarUrl.includes("?") ? "&" : "?"}v=${avatarBust}`
      : baseAvatarUrl;

  const onPickImage = () => fileInputRef.current?.click();

  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user?.id || !token) return;
    const trimmedName = name.trim();
    const trimmedPhone = phoneInput.trim();
    if (!trimmedName) {
      setSaveError("Name cannot be empty.");
      return;
    }
    if (!trimmedPhone) {
      setSaveError("Phone cannot be empty.");
      return;
    }
    setSaveError(null);
    setSaveSuccess(false);
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("name", trimmedName);
      fd.append("phone", trimmedPhone);
      fd.append("image", file);
      await apiPatchForm<AuthUser>(`/api/users/${user.id}/`, fd, token);
      await refreshUser();
      setAvatarBust((b) => b + 1);
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not update photo.");
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async () => {
    if (!user?.id || !token) return;
    const trimmedName = name.trim();
    const trimmedPhone = phoneInput.trim();
    if (!trimmedName) {
      setSaveError("Name cannot be empty.");
      return;
    }
    if (!trimmedPhone) {
      setSaveError("Phone cannot be empty.");
      return;
    }
    setSaveError(null);
    setSaveSuccess(false);
    setSaving(true);
    try {
      await apiPatch<AuthUser>(`/api/users/${user.id}/`, { name: trimmedName, phone: trimmedPhone }, token);
      await refreshUser();
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h2 className="font-display font-semibold text-lg text-foreground mb-4">Profile</h2>

      <div className="max-w-md">
        <div className="flex flex-col items-center mb-6">
          <button
            type="button"
            onClick={onPickImage}
            disabled={saving}
            className="relative w-20 h-20 rounded-full bg-primary-50 flex items-center justify-center mb-3 overflow-hidden border border-border shrink-0 disabled:opacity-50 hover:opacity-90 transition-opacity"
            aria-label="Change profile photo"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <User size={32} className="text-primary" />
            )}
          </button>
          <p className="font-display font-bold text-lg text-foreground">{userName || "Shareholder"}</p>
          <p className="text-sm text-text-muted flex items-center gap-1">
            <Phone size={12} /> {phone || "—"}
          </p>
        </div>

        <div className="space-y-3 mb-6 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium text-foreground">Edit your profile</p>
          <label className="block text-xs text-text-muted" htmlFor="shareholder-profile-name">
            Name
          </label>
          <input
            id="shareholder-profile-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-11 rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
            autoComplete="name"
          />
          <label className="block text-xs text-text-muted" htmlFor="shareholder-profile-phone">
            Phone
          </label>
          <input
            id="shareholder-profile-phone"
            type="tel"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            className="w-full h-11 rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
            autoComplete="tel"
          />
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={saveProfile}
              disabled={saving}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
            >
              <Save size={16} />
              Save changes
            </button>
            <button
              type="button"
              onClick={onPickImage}
              disabled={saving}
              className="h-10 px-4 rounded-lg border border-border text-sm font-medium text-foreground disabled:opacity-50"
            >
              Update photo
            </button>
          </div>
          {saveError ? <p className="text-sm text-error">{saveError}</p> : null}
          {saveSuccess ? <p className="text-sm text-emerald-600">Saved successfully.</p> : null}
        </div>

        <div className="space-y-3 mb-6">
          <div className="bg-card rounded-xl border border-border p-4 flex items-center justify-between">
            <div>
              <label className="text-xs text-text-muted block mb-1">Share Percentage</label>
              <p className="text-sm font-bold text-foreground">{shareLabel}</p>
            </div>
            <TrendingUp size={20} className="text-primary" />
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <label className="text-xs text-text-muted block mb-1">Balance</label>
            <p className="text-sm font-bold text-foreground font-mono">{balanceLabel}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <label className="text-xs text-text-muted block mb-1">Due Balance</label>
            <p className="text-sm font-bold text-foreground font-mono">{dueLabel}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setLogoutConfirmOpen(true)}
          className="w-full h-12 rounded-xl bg-error text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-all"
        >
          <LogOut size={16} /> Logout
        </button>
      </div>

      <ConfirmModal
        open={logoutConfirmOpen}
        title="Logout"
        message="Are you sure you want to logout?"
        confirmLabel="Logout"
        variant="danger"
        onConfirm={() => {
          setLogoutConfirmOpen(false);
          void logout();
        }}
        onCancel={() => setLogoutConfirmOpen(false)}
      />
    </>
  );
}
