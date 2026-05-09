import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, getStoredToken, setStoredToken } from "@/lib/api";

export type PortalRole = "superadmin" | "owner" | "waiter" | "cashier" | "kitchen" | "customer" | "shareholder";

export interface AuthUser {
  id: number;
  phone: string;
  name: string;
  role: string;
  is_shareholder: boolean;
  share_percentage: string;
  balance: string;
  due_balance: string;
  image: string | null;
  portal_role: PortalRole;
  restaurant_ids: number[];
  default_restaurant_id: number | null;
  staff_memberships: Array<{
    id: number;
    restaurant: number;
    restaurant_name: string;
    role: string;
    joined_at: string;
    is_suspend: boolean;
  }>;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
}

interface AuthContextType extends AuthState {
  /** @deprecated use user.name */
  userName: string | null;
  phone: string | null;
  /** Portal role for layouts (alias of user.portal_role) */
  role: PortalRole | null;
  loginWithToken: (token: string, user: AuthUser) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setToken: (token: string | null) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const USER_KEY = "myrestro_user";

function loadUserFromStorage(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

/** Sync read of cached user (e.g. route guards before React auth state runs). */
export function getStoredAuthUser(): AuthUser | null {
  return loadUserFromStorage();
}

function saveUserToStorage(user: AuthUser | null): void {
  if (typeof window === "undefined") return;
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>(() => ({
    token: typeof window !== "undefined" ? getStoredToken() : null,
    user: loadUserFromStorage(),
    isAuthenticated: Boolean(typeof window !== "undefined" && getStoredToken() && loadUserFromStorage()),
    isHydrated: false,
  }));

  const refreshUser = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      queryClient.removeQueries({ queryKey: ["users"] });
      setState((s) => ({ ...s, user: null, isAuthenticated: false, isHydrated: true }));
      saveUserToStorage(null);
      return;
    }
    try {
      const user = await apiGet<AuthUser>("/api/auth/me/", token);
      saveUserToStorage(user);
      setState({ token, user, isAuthenticated: true, isHydrated: true });
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch {
      setStoredToken(null);
      saveUserToStorage(null);
      setState({ token: null, user: null, isAuthenticated: false, isHydrated: true });
      queryClient.removeQueries({ queryKey: ["users"] });
    }
  }, [queryClient]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const loginWithToken = useCallback(
    (token: string, user: AuthUser) => {
      setStoredToken(token);
      saveUserToStorage(user);
      setState({ token, user, isAuthenticated: true, isHydrated: true });
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    const token = getStoredToken();
    if (token) {
      try {
        await apiPost("/api/auth/logout/", {}, token);
      } catch {
        /* ignore */
      }
    }
    queryClient.removeQueries({ queryKey: ["users"] });
    setStoredToken(null);
    saveUserToStorage(null);
    setState({ token: null, user: null, isAuthenticated: false, isHydrated: true });
  }, [queryClient]);

  const setToken = useCallback((token: string | null) => {
    setStoredToken(token);
    if (!token) saveUserToStorage(null);
    setState((s) => ({ ...s, token, isAuthenticated: Boolean(token && s.user), isHydrated: true }));
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      userName: state.user?.name ?? null,
      phone: state.user?.phone ?? null,
      role: (state.user?.portal_role as PortalRole) ?? null,
      loginWithToken,
      logout,
      refreshUser,
      setToken,
    }),
    [state, loginWithToken, logout, refreshUser, setToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
