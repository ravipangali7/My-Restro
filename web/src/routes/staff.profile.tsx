import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef, useCallback, type ChangeEvent } from "react";
import { useAuth, type AuthUser } from "@/lib/auth-context";
import { User, Phone, LogOut, Building2, Pencil } from "lucide-react";
import { apiPatch, apiPatchForm, resolveMediaUrl } from "@/lib/api";
import { ConfirmModal } from "@/components/shared/ConfirmModal";

export const Route = createFileRoute("/staff/profile")({ component: StaffProfile });

function StaffProfile() {
  const { userName, phone, role, logout, user, token, refreshUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [avatarBust, setAvatarBust] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const revokePendingPreview = useCallback(() => {
    setPendingPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPendingImage(null);
  }, []);

  useEffect(() => {
    return () => {
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    };
  }, [pendingPreviewUrl]);

  const baseAvatarUrl = resolveMediaUrl(user?.image ?? null);
  const avatarUrl =
    baseAvatarUrl && avatarBust > 0
      ? `${baseAvatarUrl}${baseAvatarUrl.includes("?") ? "&" : "?"}v=${avatarBust}`
      : baseAvatarUrl;

  const editAvatarSrc = pendingPreviewUrl || avatarUrl;

  const assignedRestaurants = useMemo(() => {
    const rows = user?.staff_memberships?.filter((m) => !m.is_suspend) ?? [];
    return rows.map((m) => m.restaurant_name).filter(Boolean);
  }, [user?.staff_memberships]);

  const canEditProfile = role === "waiter" || role === "cashier" || role === "kitchen";

  const openEdit = () => {
    setSaveError(null);
    setEditName(user?.name ?? userName ?? "");
    setEditPhone(user?.phone ?? phone ?? "");
    revokePendingPreview();
    setIsEditing(true);
  };

  const cancelEdit = () => {
    revokePendingPreview();
    setSaveError(null);
    setIsEditing(false);
  };

  const onPickImage = () => fileInputRef.current?.click();

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPendingPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setPendingImage(file);
    setSaveError(null);
  };

  const saveProfile = async () => {
    if (!user?.id || !token) return;
    const trimmedName = editName.trim();
    const trimmedPhone = editPhone.trim();
    if (!trimmedName) {
      setSaveError("Name cannot be empty.");
      return;
    }
    if (!trimmedPhone) {
      setSaveError("Phone cannot be empty.");
      return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      if (pendingImage) {
        const fd = new FormData();
        fd.append("name", trimmedName);
        fd.append("phone", trimmedPhone);
        fd.append("image", pendingImage);
        await apiPatchForm<AuthUser>(`/api/users/${user.id}/`, fd, token);
      } else {
        await apiPatch<AuthUser>(`/api/users/${user.id}/`, { name: trimmedName, phone: trimmedPhone }, token);
      }
      await refreshUser();
      setAvatarBust((b) => b + 1);
      revokePendingPreview();
      setIsEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-foreground">Profile</h2>
        {canEditProfile && !isEditing ? (
          <button
            type="button"
            onClick={openEdit}
            disabled={saving}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-muted/60 disabled:opacity-50"
            aria-label="Edit profile"
          >
            <Pencil className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="max-w-md">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-hidden
          onChange={onFileChange}
        />

        <div className="mb-6 flex flex-col items-center">
          <div className="relative mb-3 flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-primary-50">
            {!isEditing && avatarUrl ? (
              <img src={avatarUrl} alt="" className="absolute inset-0 size-full object-cover" />
            ) : !isEditing ? (
              <User size={32} className="text-primary" />
            ) : null}
            {isEditing &&
              (editAvatarSrc ? (
                <img src={editAvatarSrc} alt="" className="absolute inset-0 size-full object-cover" />
              ) : (
                <User size={32} className="text-primary" />
              ))}
          </div>
          <p className="font-display text-lg font-bold text-foreground">{userName || "Staff"}</p>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-text-muted">
            <Phone size={12} aria-hidden /> {phone || "—"}
          </p>
          <span className="mt-1 rounded-full bg-primary-50 px-3 py-0.5 text-xs font-semibold capitalize text-primary">
            {role}
          </span>
          {assignedRestaurants.length > 0 ? (
            <p className="mt-4 flex max-w-full items-start justify-center gap-2 text-center text-sm text-text-secondary">
              <Building2 size={16} className="mt-0.5 shrink-0 text-text-muted" />
              <span>
                <span className="font-medium text-foreground">Restaurant</span>
                {assignedRestaurants.length > 1 ? "s" : ""}: {assignedRestaurants.join(", ")}
              </span>
            </p>
          ) : (
            <p className="mt-4 text-center text-sm text-text-muted">No restaurant assignment on file.</p>
          )}
        </div>

        {canEditProfile && isEditing ? (
          <div className="mb-6 space-y-3 rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-medium text-foreground">Edit your profile</p>
            <div>
              <p className="mb-2 text-xs text-text-muted">Profile photo</p>
              <button
                type="button"
                onClick={onPickImage}
                disabled={saving}
                className="h-10 w-full rounded-lg border border-dashed border-border text-sm font-medium text-text-secondary transition-colors hover:bg-surface/80 disabled:opacity-50"
              >
                {pendingImage ? "Replace photo" : "Choose profile photo"}
              </button>
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-muted" htmlFor="staff-profile-name">
                Display name
              </label>
              <input
                id="staff-profile-name"
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
                autoComplete="name"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-muted" htmlFor="staff-profile-phone">
                Phone
              </label>
              <input
                id="staff-profile-phone"
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
                autoComplete="tel"
              />
            </div>
            {saveError ? <p className="text-sm text-error">{saveError}</p> : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelEdit}
                disabled={saving}
                className="h-10 flex-1 rounded-lg border border-border text-sm font-semibold text-text-secondary disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveProfile()}
                disabled={saving}
                className="h-10 flex-1 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setShowLogoutConfirm(true)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-error text-sm font-semibold text-primary-foreground hover:opacity-90"
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
