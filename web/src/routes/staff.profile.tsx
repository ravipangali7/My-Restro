import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef, type ChangeEvent } from "react";
import { useAuth, type AuthUser } from "@/lib/auth-context";
import { User, Phone, LogOut, Building2, Save } from "lucide-react";
import { apiPatch, apiPatchForm, resolveMediaUrl } from "@/lib/api";
import { ConfirmModal } from "@/components/shared/ConfirmModal";

export const Route = createFileRoute("/staff/profile")({ component: StaffProfile });

function StaffProfile() {
  const { userName, phone, role, logout, user, token, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [avatarBust, setAvatarBust] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(user?.name ?? "");
  }, [user?.name]);

  useEffect(() => {
    if (!saveSuccess) return;
    const t = window.setTimeout(() => setSaveSuccess(false), 2500);
    return () => window.clearTimeout(t);
  }, [saveSuccess]);

  const baseAvatarUrl = resolveMediaUrl(user?.image ?? null);
  const avatarUrl =
    baseAvatarUrl && avatarBust > 0
      ? `${baseAvatarUrl}${baseAvatarUrl.includes("?") ? "&" : "?"}v=${avatarBust}`
      : baseAvatarUrl;

  const assignedRestaurants = useMemo(() => {
    const rows = user?.staff_memberships?.filter((m) => !m.is_suspend) ?? [];
    return rows.map((m) => m.restaurant_name).filter(Boolean);
  }, [user?.staff_memberships]);

  const canEditProfile = role === "waiter" || role === "cashier" || role === "kitchen";

  const onPickImage = () => fileInputRef.current?.click();

  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user?.id || !token) return;
    setSaveError(null);
    setSaveSuccess(false);
    setSaving(true);
    try {
      const fd = new FormData();
      if (name.trim()) fd.append("name", name.trim());
      fd.append("image", file);
      const updated = await apiPatchForm<AuthUser>(`/api/users/${user.id}/`, fd, token);
      await refreshUser();
      if (updated.name) setName(updated.name);
      setAvatarBust((b) => b + 1);
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not update photo.");
    } finally {
      setSaving(false);
    }
  };

  const saveName = async () => {
    if (!user?.id || !token) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setSaveError("Name cannot be empty.");
      return;
    }
    setSaveError(null);
    setSaveSuccess(false);
    setSaving(true);
    try {
      await apiPatch<AuthUser>(`/api/users/${user.id}/`, { name: trimmed }, token);
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
          {canEditProfile ? (
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
          ) : (
            <div className="relative w-20 h-20 rounded-full bg-primary-50 flex items-center justify-center mb-3 overflow-hidden border border-border shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <User size={32} className="text-primary" />
              )}
            </div>
          )}
          <p className="font-display font-bold text-lg text-foreground">{userName || "Staff"}</p>
          <p className="text-sm text-text-muted flex items-center gap-1">
            <Phone size={12} /> {phone || "—"}
          </p>
          <span className="mt-1 px-3 py-0.5 rounded-full text-xs font-semibold bg-primary-50 text-primary capitalize">{role}</span>
          {assignedRestaurants.length > 0 ? (
            <p className="mt-4 text-sm text-text-secondary text-center flex items-start justify-center gap-2 max-w-full">
              <Building2 size={16} className="text-text-muted shrink-0 mt-0.5" />
              <span>
                <span className="font-medium text-foreground">Restaurant</span>
                {assignedRestaurants.length > 1 ? "s" : ""}: {assignedRestaurants.join(", ")}
              </span>
            </p>
          ) : (
            <p className="mt-4 text-sm text-text-muted text-center">No restaurant assignment on file.</p>
          )}
        </div>

        {canEditProfile && (
          <div className="space-y-3 mb-6 rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-medium text-foreground">Edit your profile</p>
            <label className="block text-xs text-text-muted" htmlFor="staff-profile-name">
              Display name
            </label>
            <input
              id="staff-profile-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-11 rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
              autoComplete="name"
            />
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveName}
                disabled={saving}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
              >
                <Save size={16} />
                Save name
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
        )}

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
