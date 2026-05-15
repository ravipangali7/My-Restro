import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth, type AuthUser } from "@/lib/auth-context";
import { User, Phone, LogOut, Save } from "lucide-react";
import { apiPatch, apiPatchForm, resolveMediaUrl } from "@/lib/api";
import { parseLocalPhone } from "@/lib/phone-validation";
import { ConfirmModal } from "@/components/shared/ConfirmModal";

export const Route = createFileRoute("/owner/profile")({ component: OwnerProfile });

function OwnerProfile() {
  const queryClient = useQueryClient();
  const { userName, phone, logout, user, token, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [phoneInput, setPhoneInput] = useState(user?.phone ?? "");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [avatarBust, setAvatarBust] = useState(0);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(user?.name ?? "");
    setPhoneInput(user?.phone ?? "");
  }, [user?.name, user?.phone]);

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
    const phoneParsed = parseLocalPhone(phoneInput);
    if (!trimmedName) {
      setSaveError("Name cannot be empty.");
      return;
    }
    if (!phoneParsed.ok) {
      setSaveError(phoneParsed.message);
      return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("name", trimmedName);
      fd.append("phone", phoneParsed.digits);
      fd.append("image", file);
      await apiPatchForm<AuthUser>(`/api/users/${user.id}/`, fd, token);
      await refreshUser();
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      setAvatarBust((b) => b + 1);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not update photo.");
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async () => {
    if (!user?.id || !token) return;
    const trimmedName = name.trim();
    const phoneParsed = parseLocalPhone(phoneInput);
    if (!trimmedName) {
      setSaveError("Name cannot be empty.");
      return;
    }
    if (!phoneParsed.ok) {
      setSaveError(phoneParsed.message);
      return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      await apiPatch<AuthUser>(`/api/users/${user.id}/`, { name: trimmedName, phone: phoneParsed.digits }, token);
      await refreshUser();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h2 className="font-display font-semibold text-lg text-foreground mb-4">My profile</h2>
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
          <p className="font-display font-bold text-lg text-foreground">{userName || "Owner"}</p>
          <p className="text-sm text-text-muted flex items-center gap-1">
            <Phone size={12} /> {phone || "—"}
          </p>
        </div>

        <div className="space-y-3 mb-6 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium text-foreground">Edit your profile</p>
          <label className="block text-xs text-text-muted" htmlFor="owner-profile-name">
            Name
          </label>
          <input
            id="owner-profile-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-11 rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
            autoComplete="name"
          />
          <label className="block text-xs text-text-muted" htmlFor="owner-profile-phone">
            Phone
          </label>
          <input
            id="owner-profile-phone"
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
        </div>

        <button
          type="button"
          onClick={() => setShowLogoutConfirm(true)}
          className="w-full h-12 rounded-xl bg-error text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90"
        >
          <LogOut size={16} /> Logout
        </button>
      </div>

      <ConfirmModal
        open={showLogoutConfirm}
        title="Logout"
        message="Are you sure you want to logout?"
        confirmLabel="Logout"
        variant="danger"
        onConfirm={() => {
          setShowLogoutConfirm(false);
          void logout();
        }}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </>
  );
}
