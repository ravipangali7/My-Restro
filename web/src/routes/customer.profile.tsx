import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth, type AuthUser } from "@/lib/auth-context";
import { User, Phone, LogOut, Edit, ChevronRight } from "lucide-react";
import { CUSTOMER_PROFILE_MENU_LINKS } from "@/lib/customer-portal-nav";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { useMe } from "@/hooks/use-rest-api";
import { apiPatch, apiPatchForm, resolveMediaUrl } from "@/lib/api";

export const Route = createFileRoute("/customer/profile")({
  component: CustomerProfile,
});

type MeShape = { name?: string; phone?: string; image?: string | null };

function CustomerProfile() {
  const navigate = useNavigate();
  const { userName, phone, logout, user, token, refreshUser } = useAuth();
  const qc = useQueryClient();
  const { data: meData } = useMe();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(userName || "");
  const [editPhone, setEditPhone] = useState(phone || "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [avatarBust, setAvatarBust] = useState(0);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const me = (meData ?? null) as MeShape | null;

  const displayName = me?.name || user?.name || userName || "Customer";
  const displayPhone = me?.phone || user?.phone || phone || "No phone added";

  const baseAvatarUrl = resolveMediaUrl(user?.image ?? me?.image ?? null);
  const avatarUrl =
    baseAvatarUrl && avatarBust > 0
      ? `${baseAvatarUrl}${baseAvatarUrl.includes("?") ? "&" : "?"}v=${avatarBust}`
      : baseAvatarUrl;

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

  const openEdit = () => {
    setSaveError(null);
    setEditName(me?.name || user?.name || userName || "");
    setEditPhone(me?.phone || user?.phone || phone || "");
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
      void qc.invalidateQueries({ queryKey: ["me"] });
      setAvatarBust((b) => b + 1);
      revokePendingPreview();
      setIsEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save profile.");
    } finally {
      setSaving(false);
    }
  };

  const editAvatarSrc = pendingPreviewUrl || avatarUrl;

  return (
    <>
      <div className="px-4 pt-6 pb-4">
        <h1 className="font-display font-bold text-xl text-foreground">Profile</h1>
      </div>

      <div className="px-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-hidden
          onChange={onFileChange}
        />

        {/* Avatar & Overview */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-20 h-20 rounded-full bg-primary-50 flex items-center justify-center mb-3 overflow-hidden border border-border shrink-0">
            {!isEditing && avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : !isEditing ? (
              <User size={32} className="text-primary" />
            ) : null}
            {isEditing && (editAvatarSrc ? (
              <img src={editAvatarSrc} alt="" className="w-full h-full object-cover" />
            ) : (
              <User size={32} className="text-primary" />
            ))}
          </div>
          <p className="font-display font-bold text-lg text-foreground">{displayName}</p>
          <p className="text-sm text-text-muted flex items-center gap-1">
            <Phone size={12} /> {displayPhone}
          </p>
        </div>

        {/* Edit Profile */}
        {isEditing ? (
          <div className="bg-card rounded-xl border border-border p-4 mb-4 space-y-3">
            <h3 className="font-display font-semibold text-sm text-foreground">Edit Profile</h3>
            <div>
              <p className="text-xs text-text-muted mb-2">Profile photo</p>
              <button
                type="button"
                onClick={onPickImage}
                disabled={saving}
                className="w-full h-10 rounded-lg border border-dashed border-border text-sm font-medium text-text-secondary hover:bg-surface/80 transition-colors disabled:opacity-50"
              >
                {pendingImage ? "Replace photo" : "Choose profile photo"}
              </button>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-border bg-surface text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                autoComplete="name"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Phone</label>
              <input
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-border bg-surface text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                autoComplete="tel"
              />
            </div>
            {saveError ? <p className="text-xs text-error">{saveError}</p> : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelEdit}
                disabled={saving}
                className="flex-1 h-10 rounded-lg border border-border text-sm font-semibold text-text-secondary disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveProfile()}
                disabled={saving}
                className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={openEdit}
            className="w-full bg-card rounded-xl border border-border p-4 flex items-center justify-between mb-4 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center gap-3">
              <Edit size={16} className="text-primary" />
              <span className="text-sm font-medium text-foreground">Edit Profile</span>
            </div>
            <ChevronRight size={16} className="text-text-muted" />
          </button>
        )}

        {/* Quick Links */}
        <div className="space-y-2 mb-4">
          {CUSTOMER_PROFILE_MENU_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="w-full bg-card rounded-xl border border-border p-4 flex items-center justify-between hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center gap-3">
                <link.icon size={16} className="text-primary" />
                <span className="text-sm font-medium text-foreground">{link.title}</span>
              </div>
              <ChevronRight size={16} className="text-text-muted" />
            </Link>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowLogoutConfirm(true)}
          className="w-full h-12 rounded-xl bg-error text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-all"
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
          void logout().then(() => {
            navigate({ to: "/login", replace: true });
          });
        }}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </>
  );
}
