import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiDelete, apiGet, apiPatch, apiPatchForm, apiPost, apiPostForm } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useRestaurantScope } from "@/lib/restaurant-context";
import {
  cachePlatformDefaults,
  cacheSuperSettings,
  readPlatformDefaultsCache,
  readSuperSettingsCache,
  type PlatformDefaultsDTO,
  type SuperSettingsDTO,
} from "@/lib/super-settings-cache";

export function useMe() {
  const { token, isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["me", token],
    queryFn: () => apiGet<unknown>("/api/auth/me/", token),
    enabled: isAuthenticated && Boolean(token),
    staleTime: 60_000,
  });
}

export function useRestaurants() {
  const { token, isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["restaurants", token],
    queryFn: () => apiGet<unknown[]>("/api/restaurants/", token),
    enabled: isAuthenticated,
  });
}

export function usePayRestaurantDue() {
  const qc = useQueryClient();
  const { token } = useAuth();
  return useMutation({
    mutationFn: (payload: { restaurantId: number; remarks?: string; amount: string }) =>
      apiPost<unknown>(`/api/restaurants/${payload.restaurantId}/pay-due/`, {
        remarks: payload.remarks?.trim() || undefined,
        amount: payload.amount,
      }, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["restaurants"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export function useOrders(
  restaurantId: number | null,
  options?: { refetchInterval?: number | false; forWaiterPickupQueue?: boolean },
) {
  const { token, isAuthenticated, user } = useAuth();
  const isCustomer = user?.portal_role === "customer";
  const forWaiterPickupQueue = options?.forWaiterPickupQueue === true;
  return useQuery({
    queryKey: ["orders", restaurantId, isCustomer, forWaiterPickupQueue, token],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (restaurantId != null) qs.set("restaurant_id", String(restaurantId));
      if (forWaiterPickupQueue) qs.set("for_waiter_pickup", "1");
      const suffix = qs.toString();
      return apiGet<unknown[]>(`/api/orders/${suffix ? `?${suffix}` : ""}`, token);
    },
    enabled: isAuthenticated && (isCustomer || restaurantId != null),
    refetchInterval: options?.refetchInterval ?? false,
  });
}

export function useOrderDetail(id: number | null) {
  const { token, isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["order", id, token],
    queryFn: () => apiGet<unknown>(`/api/orders/${id}/`, token),
    enabled: isAuthenticated && id != null,
  });
}

function isWaiterPickupOrdersQueryKey(queryKey: readonly unknown[]): boolean {
  return queryKey[0] === "orders" && queryKey.length >= 4 && queryKey[3] === true;
}

export function useTransitionOrderStatus() {
  const qc = useQueryClient();
  const { token } = useAuth();
  return useMutation({
    mutationFn: (payload: {
      orderId: number;
      status: string;
      rejectReason?: string;
      consumeInventoryWhenReady?: boolean;
    }) =>
      apiPost<unknown>(
        `/api/orders/${payload.orderId}/transition-status/`,
        {
          status: payload.status,
          reject_reason: payload.rejectReason ?? "",
          consume_inventory_when_ready: payload.consumeInventoryWhenReady ?? true,
        },
        token,
      ),
    onSuccess: (data, vars) => {
      // Waiter pickup list (`?for_waiter_pickup=1`) only returns `waiting_pickup` rows.
      // Drop the row from that cache on delivery so the card disappears immediately and
      // never lingers if merge payload is incomplete.
      if (vars.status === "delivered") {
        qc.setQueriesData(
          { predicate: (q) => isWaiterPickupOrdersQueryKey(q.queryKey) },
          (old: unknown) => {
            if (!Array.isArray(old)) return old;
            return old.filter(
              (item) =>
                typeof item !== "object" ||
                item === null ||
                !("id" in item) ||
                (item as { id: number }).id !== vars.orderId,
            );
          },
        );
      }
      // Merge the updated order into other cached order lists (live orders, owner, etc.).
      if (data && typeof data === "object" && !Array.isArray(data) && "id" in data) {
        const updated = data as Record<string, unknown> & { id: number };
        qc.setQueriesData(
          {
            predicate: (q) =>
              q.queryKey[0] === "orders" &&
              !(isWaiterPickupOrdersQueryKey(q.queryKey) && vars.status === "delivered"),
          },
          (old: unknown) => {
            if (!Array.isArray(old)) return old;
            return old.map((item) => {
              if (typeof item !== "object" || item === null || !("id" in item)) return item;
              const row = item as { id: number };
              if (row.id !== updated.id) return item;
              return { ...row, ...updated };
            });
          },
        );
      }
      void qc.invalidateQueries({ queryKey: ["orders"] });
      void qc.invalidateQueries({ queryKey: ["order", vars.orderId] });
      // Ready transitions consume inventory and create stock logs; refresh inventory views too.
      void qc.invalidateQueries({ queryKey: ["stock-logs"] });
      void qc.invalidateQueries({ queryKey: ["raw-materials"] });
    },
  });
}

/**
 * Lists purchases the user may access (owner: all their restaurants; staff: assigned restaurants).
 * With no argument, the request omits `restaurant_id`, so the API returns every purchase for the
 * role — new rows show up even when they belong to a different restaurant than the header scope.
 * Pass a restaurant id only when you need that location filtered.
 */
export function usePurchases(narrowToRestaurant?: number | null) {
  const { token, isAuthenticated } = useAuth();
  const narrow =
    narrowToRestaurant !== undefined &&
    narrowToRestaurant !== null &&
    narrowToRestaurant > 0;
  const rid = narrow ? narrowToRestaurant : null;
  return useQuery({
    queryKey: narrow ? ["purchases", rid, token] : ["purchases", "all", token],
    queryFn: () => {
      const qs = narrow && rid != null ? `?restaurant_id=${rid}` : "";
      return apiGet<unknown[]>(`/api/purchases/${qs}`, token);
    },
    enabled: isAuthenticated,
  });
}

export function usePurchaseDetail(id: number | null) {
  const { token, isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["purchase", id, token],
    queryFn: () => apiGet<unknown>(`/api/purchases/${id}/`, token),
    enabled: isAuthenticated && id != null,
  });
}

export function useCategories(restaurantId: number | null) {
  const { token, isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["categories", restaurantId, token],
    queryFn: () => apiGet<unknown[]>(`/api/categories/?restaurant_id=${restaurantId}`, token),
    enabled: isAuthenticated && restaurantId != null,
  });
}

export function useProducts(restaurantId: number | null) {
  const { token, isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["products", restaurantId, token],
    queryFn: () => apiGet<unknown[]>(`/api/products/?restaurant_id=${restaurantId}`, token),
    enabled: isAuthenticated && restaurantId != null,
  });
}

export function useProductItems(restaurantId: number | null) {
  const { token, isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["product-items", restaurantId, token],
    queryFn: () => apiGet<unknown[]>(`/api/product-items/?restaurant_id=${restaurantId}`, token),
    enabled: isAuthenticated && restaurantId != null,
  });
}

/** One query per managed restaurant; merged catalog for owner-wide analytics (e.g. reports). */
export function useOwnerProductsByRestaurant(options?: { enabled?: boolean }) {
  const enabledFlag = options?.enabled ?? true;
  const { token, isAuthenticated } = useAuth();
  const { restaurantIds } = useRestaurantScope();
  const queries = useQueries({
    queries: restaurantIds.map((rid) => ({
      queryKey: ["products", rid, token],
      queryFn: () => apiGet<unknown[]>(`/api/products/?restaurant_id=${rid}`, token),
      enabled: Boolean(isAuthenticated && restaurantIds.length > 0 && enabledFlag),
    })),
  });
  const sections = useMemo(
    () =>
      restaurantIds.map((rid, i) => ({
        restaurantId: rid,
        products: (queries[i]?.data as unknown[] | undefined) ?? [],
        isPending: queries[i]?.isPending ?? false,
      })),
    [restaurantIds, queries],
  );
  const mergedProducts = useMemo(
    () =>
      sections.flatMap((s) =>
        (s.products as { id: number; name: string }[]).map((p) => ({ ...p, restaurantId: s.restaurantId })),
      ),
    [sections],
  );
  const isPending = queries.some((q) => q.isPending);
  return { sections, mergedProducts, isPending };
}

/** One query per managed restaurant; merged items tagged with `restaurantId` for reports. */
export function useOwnerProductItemsByRestaurant(options?: { enabled?: boolean }) {
  const enabledFlag = options?.enabled ?? true;
  const { token, isAuthenticated } = useAuth();
  const { restaurantIds } = useRestaurantScope();
  const queries = useQueries({
    queries: restaurantIds.map((rid) => ({
      queryKey: ["product-items", rid, token],
      queryFn: () => apiGet<unknown[]>(`/api/product-items/?restaurant_id=${rid}`, token),
      enabled: Boolean(isAuthenticated && restaurantIds.length > 0 && enabledFlag),
    })),
  });
  const sections = useMemo(
    () =>
      restaurantIds.map((rid, i) => ({
        restaurantId: rid,
        items: (queries[i]?.data as unknown[] | undefined) ?? [],
        isPending: queries[i]?.isPending ?? false,
      })),
    [restaurantIds, queries],
  );
  const mergedItems = useMemo(
    () =>
      sections.flatMap((s) =>
        (s.items as { id: number; product: number }[]).map((it) => ({ ...it, restaurantId: s.restaurantId })),
      ),
    [sections],
  );
  const isPending = queries.some((q) => q.isPending);
  return { sections, mergedItems, isPending };
}

export function useUnits(restaurantId: number | null) {
  const { token, isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["units", restaurantId, token],
    queryFn: () => apiGet<unknown[]>(`/api/units/?restaurant_id=${restaurantId}`, token),
    enabled: isAuthenticated && restaurantId != null,
  });
}

/** One query per managed restaurant; use on owner pages that should show all locations (like staff). */
export function useOwnerUnitsByRestaurant(options?: { enabled?: boolean }) {
  const enabledFlag = options?.enabled ?? true;
  const { token, isAuthenticated } = useAuth();
  const { restaurantIds } = useRestaurantScope();
  const queries = useQueries({
    queries: restaurantIds.map((rid) => ({
      queryKey: ["units", rid, token],
      queryFn: () => apiGet<unknown[]>(`/api/units/?restaurant_id=${rid}`, token),
      enabled: Boolean(isAuthenticated && restaurantIds.length > 0 && enabledFlag),
    })),
  });
  const sections = useMemo(
    () =>
      restaurantIds.map((rid, i) => ({
        restaurantId: rid,
        units: (queries[i]?.data as unknown[] | undefined) ?? [],
        isPending: queries[i]?.isPending ?? false,
      })),
    [restaurantIds, queries],
  );
  const isPending = queries.some((q) => q.isPending);
  const error = useMemo(() => {
    for (const q of queries) {
      if (q.isError && q.error instanceof Error) return q.error;
    }
    return null;
  }, [queries]);
  return { sections, isPending, error };
}

export function useTables(restaurantId: number | null) {
  const { token, isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["tables", restaurantId, token],
    queryFn: () => apiGet<unknown[]>(`/api/tables/?restaurant_id=${restaurantId}`, token),
    enabled: isAuthenticated && restaurantId != null,
  });
}

/** One query per managed restaurant; use on owner pages that should list all locations (like units). */
export function useOwnerTablesByRestaurant(options?: { enabled?: boolean }) {
  const enabledFlag = options?.enabled ?? true;
  const { token, isAuthenticated } = useAuth();
  const { restaurantIds } = useRestaurantScope();
  const queries = useQueries({
    queries: restaurantIds.map((rid) => ({
      queryKey: ["tables", rid, token],
      queryFn: () => apiGet<unknown[]>(`/api/tables/?restaurant_id=${rid}`, token),
      enabled: Boolean(isAuthenticated && restaurantIds.length > 0 && enabledFlag),
    })),
  });
  const sections = useMemo(
    () =>
      restaurantIds.map((rid, i) => ({
        restaurantId: rid,
        tables: (queries[i]?.data as unknown[] | undefined) ?? [],
        isPending: queries[i]?.isPending ?? false,
      })),
    [restaurantIds, queries],
  );
  const isPending = queries.some((q) => q.isPending);
  const error = useMemo(() => {
    for (const q of queries) {
      if (q.isError && q.error instanceof Error) return q.error;
    }
    return null;
  }, [queries]);
  return { sections, isPending, error };
}

export function useSuppliers(restaurantId: number | null, opts?: { allRestaurants?: boolean; enabled?: boolean }) {
  const { token, isAuthenticated, user } = useAuth();
  const isSuper = user?.portal_role === "superadmin";
  const allRestaurants = Boolean(opts?.allRestaurants);
  const enabledFlag = opts?.enabled ?? true;
  return useQuery({
    queryKey: ["suppliers", restaurantId, isSuper, allRestaurants, token],
    queryFn: () => {
      if (isSuper && allRestaurants) {
        return apiGet<unknown[]>(`/api/suppliers/`, token);
      }
      const qs = new URLSearchParams();
      if (restaurantId != null) qs.set("restaurant_id", String(restaurantId));
      const suffix = qs.toString();
      return apiGet<unknown[]>(`/api/suppliers/${suffix ? `?${suffix}` : ""}`, token);
    },
    enabled:
      enabledFlag && isAuthenticated && (restaurantId != null || (isSuper && allRestaurants)),
    staleTime: 0,
  });
}

/** One query per managed restaurant; list all locations on the owner suppliers page (like units). */
export function useOwnerSuppliersByRestaurant(options?: { enabled?: boolean }) {
  const enabledFlag = options?.enabled ?? true;
  const { token, isAuthenticated } = useAuth();
  const { restaurantIds } = useRestaurantScope();
  const queries = useQueries({
    queries: restaurantIds.map((rid) => ({
      queryKey: ["suppliers", rid, token],
      queryFn: () => apiGet<unknown[]>(`/api/suppliers/?restaurant_id=${rid}`, token),
      enabled: Boolean(isAuthenticated && restaurantIds.length > 0 && enabledFlag),
    })),
  });
  const sections = useMemo(
    () =>
      restaurantIds.map((rid, i) => ({
        restaurantId: rid,
        suppliers: (queries[i]?.data as unknown[] | undefined) ?? [],
        isPending: queries[i]?.isPending ?? false,
      })),
    [restaurantIds, queries],
  );
  const isPending = queries.some((q) => q.isPending);
  const error = useMemo(() => {
    for (const q of queries) {
      if (q.isError && q.error instanceof Error) return q.error;
    }
    return null;
  }, [queries]);
  return { sections, isPending, error };
}

export function useRawMaterials(restaurantId: number | null) {
  const { token, isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["raw-materials", restaurantId, token],
    queryFn: () => apiGet<unknown[]>(`/api/raw-materials/?restaurant_id=${restaurantId}`, token),
    enabled: isAuthenticated && restaurantId != null,
  });
}

/** One query per managed restaurant; merged list on owner raw materials (like suppliers). */
export function useOwnerRawMaterialsByRestaurant(options?: { enabled?: boolean }) {
  const enabledFlag = options?.enabled ?? true;
  const { token, isAuthenticated } = useAuth();
  const { restaurantIds } = useRestaurantScope();
  const queries = useQueries({
    queries: restaurantIds.map((rid) => ({
      queryKey: ["raw-materials", rid, token],
      queryFn: () => apiGet<unknown[]>(`/api/raw-materials/?restaurant_id=${rid}`, token),
      enabled: Boolean(isAuthenticated && restaurantIds.length > 0 && enabledFlag),
    })),
  });
  const sections = useMemo(
    () =>
      restaurantIds.map((rid, i) => ({
        restaurantId: rid,
        rawMaterials: (queries[i]?.data as unknown[] | undefined) ?? [],
        isPending: queries[i]?.isPending ?? false,
      })),
    [restaurantIds, queries],
  );
  const isPending = queries.some((q) => q.isPending);
  const error = useMemo(() => {
    for (const q of queries) {
      if (q.isError && q.error instanceof Error) return q.error;
    }
    return null;
  }, [queries]);
  return { sections, isPending, error };
}

export function useExpenses(restaurantId: number | null) {
  const { token, isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["expenses", restaurantId, token],
    queryFn: () => {
      if (restaurantId == null) {
        return Promise.reject(new Error("restaurant_id is required to list expenses."));
      }
      return apiGet<unknown[]>(`/api/expenses/?restaurant_id=${restaurantId}`, token);
    },
    enabled: isAuthenticated && restaurantId != null,
  });
}

/** One query per managed restaurant; merged on owner expenses (same pattern as raw materials). */
export function useOwnerExpensesByRestaurant(options?: { enabled?: boolean }) {
  const enabledFlag = options?.enabled ?? true;
  const { token, isAuthenticated } = useAuth();
  const { restaurantIds } = useRestaurantScope();
  const queries = useQueries({
    queries: restaurantIds.map((rid) => ({
      queryKey: ["expenses", rid, token],
      queryFn: () => apiGet<unknown[]>(`/api/expenses/?restaurant_id=${rid}`, token),
      enabled: Boolean(isAuthenticated && restaurantIds.length > 0 && enabledFlag),
    })),
  });
  const sections = useMemo(
    () =>
      restaurantIds.map((rid, i) => ({
        restaurantId: rid,
        expenses: (queries[i]?.data as unknown[] | undefined) ?? [],
        isPending: queries[i]?.isPending ?? false,
      })),
    [restaurantIds, queries],
  );
  const mergedExpenses = useMemo(() => sections.flatMap((s) => s.expenses), [sections]);
  const isPending = queries.some((q) => q.isPending);
  const error = useMemo(() => {
    for (const q of queries) {
      if (q.isError && q.error instanceof Error) return q.error;
    }
    return null;
  }, [queries]);
  return { sections, mergedExpenses, isPending, error };
}

export function useExpense(id: string | undefined) {
  const { mergedExpenses, isPending, error } = useOwnerExpensesByRestaurant();
  const row = useMemo(
    () => (mergedExpenses as { id: number }[]).find((x) => String(x.id) === id),
    [mergedExpenses, id],
  );
  return { data: row, isLoading: isPending, error };
}

export function useTransactions(restaurantId: number | null, options?: { allOwned?: boolean }) {
  const { token, isAuthenticated, user } = useAuth();
  const isSuperPortal = user?.portal_role === "superadmin";
  const isDbSuperAdmin = user?.role === "super_admin";
  const canListPlatformTransactions = isSuperPortal || isDbSuperAdmin;
  const shareholderSelf = user?.portal_role === "shareholder";
  const allOwned = options?.allOwned === true;
  return useQuery({
    queryKey: ["transactions", restaurantId, canListPlatformTransactions, shareholderSelf, allOwned, token],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (restaurantId != null) qs.set("restaurant_id", String(restaurantId));
      if (shareholderSelf) qs.set("shareholder_self", "1");
      if (allOwned) qs.set("all_owned", "1");
      const s = qs.toString();
      return apiGet<unknown[]>(`/api/transactions/${s ? `?${s}` : ""}`, token);
    },
    enabled: isAuthenticated && (canListPlatformTransactions || restaurantId != null || allOwned),
  });
}

/** Owner dashboards: merge order lists for order-linked transaction rows across venues. */
export function useOrdersAcrossRestaurantIds(restaurantIds: number[], enabled: boolean) {
  const { token, isAuthenticated, user } = useAuth();
  const isCustomer = user?.portal_role === "customer";
  return useQueries({
    queries: restaurantIds.map((rid) => ({
      queryKey: ["orders", rid, isCustomer, false, token],
      queryFn: () => {
        const qs = new URLSearchParams();
        qs.set("restaurant_id", String(rid));
        return apiGet<unknown[]>(`/api/orders/?${qs.toString()}`, token);
      },
      enabled: isAuthenticated && enabled && restaurantIds.length > 0,
    })),
  });
}

export function useLedgers(restaurantId: number | null, partyType?: string | null, partyId?: string | null) {
  const { token, isAuthenticated, user } = useAuth();
  const isSuperPortal = user?.portal_role === "superadmin";
  const isDbSuperAdmin = user?.role === "super_admin";
  const canListPlatformLedgers = isSuperPortal || isDbSuperAdmin;
  return useQuery({
    queryKey: ["ledgers", restaurantId, partyType, partyId, canListPlatformLedgers, token],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (restaurantId != null) qs.set("restaurant_id", String(restaurantId));
      if (partyType) qs.set("party_type", partyType);
      if (partyId) qs.set("party_id", partyId);
      const s = qs.toString();
      return apiGet<unknown[]>(`/api/ledgers/${s ? `?${s}` : ""}`, token);
    },
    enabled: isAuthenticated && (canListPlatformLedgers || restaurantId != null),
  });
}

export function useLedgersAcrossRestaurantIds(
  restaurantIds: number[],
  partyType: string,
  partyId: string | null,
  enabled = true,
) {
  const { token, isAuthenticated } = useAuth();
  return useQueries({
    queries: restaurantIds.map((rid) => ({
      queryKey: ["ledgers", rid, partyType, partyId, false, token],
      queryFn: () => {
        const qs = new URLSearchParams();
        qs.set("restaurant_id", String(rid));
        qs.set("party_type", partyType);
        if (partyId) qs.set("party_id", partyId);
        return apiGet<unknown[]>(`/api/ledgers/?${qs.toString()}`, token);
      },
      enabled: isAuthenticated && enabled && partyId != null && restaurantIds.length > 0,
    })),
  });
}

export function useCreateLedger() {
  const qc = useQueryClient();
  const { token } = useAuth();
  return useMutation({
    mutationFn: (payload: {
      restaurantId: number;
      body: { party_type: string; party_id: string; particular: string; amount: number | string; type: string };
    }) => apiPost<unknown>(`/api/ledgers/?restaurant_id=${payload.restaurantId}`, payload.body, token),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["ledgers", vars.restaurantId] });
      void qc.invalidateQueries({ queryKey: ["ledgers"] });
    },
  });
}

export function useUpdateLedger() {
  const qc = useQueryClient();
  const { token } = useAuth();
  return useMutation({
    mutationFn: (payload: { ledgerId: number; restaurantId: number; body: Record<string, unknown> }) =>
      apiPatch<unknown>(`/api/ledgers/${payload.ledgerId}/`, payload.body, token),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["ledgers", vars.restaurantId] });
      void qc.invalidateQueries({ queryKey: ["ledgers"] });
    },
  });
}

export function useDeleteLedger() {
  const qc = useQueryClient();
  const { token } = useAuth();
  return useMutation({
    mutationFn: (payload: { ledgerId: number; restaurantId: number }) => apiDelete(`/api/ledgers/${payload.ledgerId}/`, token),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["ledgers", vars.restaurantId] });
      void qc.invalidateQueries({ queryKey: ["ledgers"] });
    },
  });
}

export function useStockLogs(restaurantId: number | null) {
  const { token, isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["stock-logs", restaurantId, token],
    queryFn: () => apiGet<unknown[]>(`/api/stock-logs/?restaurant_id=${restaurantId}`, token),
    enabled: isAuthenticated && restaurantId != null,
  });
}

export function useComboSets(restaurantId: number | null) {
  const { token, isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["combo-sets", restaurantId, token],
    queryFn: () => apiGet<unknown[]>(`/api/combo-sets/?restaurant_id=${restaurantId}`, token),
    enabled: isAuthenticated && restaurantId != null,
  });
}

export function useStaffMembers(restaurantId: number | null, queryEnabled = true) {
  const { token, isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["staff", restaurantId, token],
    queryFn: () => apiGet<unknown[]>(`/api/staff/?restaurant_id=${restaurantId}`, token),
    enabled: isAuthenticated && restaurantId != null && queryEnabled,
  });
}

/** One query per restaurant the user manages; keeps cache keys aligned with useStaffMembers. */
export function useOwnerStaffByRestaurant(options?: { enabled?: boolean }) {
  const enabledFlag = options?.enabled ?? true;
  const { token, isAuthenticated } = useAuth();
  const { restaurantIds } = useRestaurantScope();
  const queries = useQueries({
    queries: restaurantIds.map((rid) => ({
      queryKey: ["staff", rid, token],
      queryFn: () => apiGet<unknown[]>(`/api/staff/?restaurant_id=${rid}`, token),
      enabled: Boolean(isAuthenticated && restaurantIds.length > 0 && enabledFlag),
    })),
  });
  const sections = useMemo(
    () =>
      restaurantIds.map((rid, i) => ({
        restaurantId: rid,
        staff: (queries[i]?.data as unknown[] | undefined) ?? [],
        isPending: queries[i]?.isPending ?? false,
      })),
    [restaurantIds, queries],
  );
  const allStaff = useMemo(
    () => sections.flatMap((s) => s.staff as { id: number; restaurant?: number }[]),
    [sections],
  );
  const isPending = queries.some((q) => q.isPending);
  return { sections, allStaff, isPending };
}

export function useCreateTable() {
  const qc = useQueryClient();
  const { token } = useAuth();
  return useMutation({
    mutationFn: (payload: { restaurantId: number; formData: FormData }) =>
      apiPostForm<unknown>(`/api/tables/?restaurant_id=${payload.restaurantId}`, payload.formData, token),
    onSuccess: (created, vars) => {
      qc.setQueryData(["tables", vars.restaurantId, token], (prev: unknown[] | undefined) => {
        if (!Array.isArray(prev)) return [created];
        return [...prev, created];
      });
      void qc.invalidateQueries({ queryKey: ["tables", vars.restaurantId] });
    },
  });
}

export function useUpdateTable() {
  const qc = useQueryClient();
  const { token } = useAuth();
  return useMutation({
    mutationFn: (payload: { tableId: number; restaurantId: number; formData: FormData }) =>
      apiPatchForm<unknown>(`/api/tables/${payload.tableId}/`, payload.formData, token),
    onSuccess: (updated, vars) => {
      qc.setQueryData(["tables", vars.restaurantId, token], (prev: unknown[] | undefined) => {
        if (!Array.isArray(prev)) return prev;
        return prev.map((item) =>
          (item as { id?: number }).id === vars.tableId ? updated : item,
        );
      });
      void qc.invalidateQueries({ queryKey: ["tables", vars.restaurantId] });
    },
  });
}

export function useDeleteTable() {
  const qc = useQueryClient();
  const { token } = useAuth();
  return useMutation({
    mutationFn: async (payload: { tableId: number; restaurantId: number }) => {
      await apiDelete(`/api/tables/${payload.tableId}/`, token);
    },
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: ["tables", vars.restaurantId] });
    },
  });
}

export function useSearchStaffByPhone(restaurantId: number | null, phone: string, enabled: boolean) {
  const { token, isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["staff-search", restaurantId, phone, token],
    queryFn: () =>
      apiGet<{ found: boolean; user?: { id: number; name?: string; phone?: string } }>(
        `/api/staff/search/?restaurant_id=${restaurantId}&phone=${encodeURIComponent(phone)}`,
        token,
      ),
    enabled: isAuthenticated && enabled && restaurantId != null,
    retry: false,
  });
}

export function useCreateStaff() {
  const qc = useQueryClient();
  const { token } = useAuth();
  return useMutation({
    mutationFn: (payload: { restaurantId: number; body: Record<string, unknown> }) =>
      apiPost<unknown>(`/api/staff/create/?restaurant_id=${payload.restaurantId}`, payload.body, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["staff"] });
      void qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUpdateStaff() {
  const qc = useQueryClient();
  const { token } = useAuth();
  return useMutation({
    mutationFn: (payload: { staffId: number; restaurantId: number; body: Record<string, unknown> }) =>
      apiPatch<unknown>(`/api/staff/${payload.staffId}/`, payload.body, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["staff"] });
    },
  });
}

export function useDeleteStaff() {
  const qc = useQueryClient();
  const { token } = useAuth();
  return useMutation({
    mutationFn: async (payload: { staffId: number; restaurantId: number }) => {
      await apiDelete(`/api/staff/${payload.staffId}/`, token);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["staff"] });
    },
  });
}

export function useCustomers(restaurantId: number | null) {
  const { token, isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["customers", restaurantId, token],
    queryFn: () => apiGet<unknown[]>(`/api/customers/?restaurant_id=${restaurantId}`, token),
    enabled: isAuthenticated && restaurantId != null,
  });
}

/** List users the caller may see. Omit filters for the full list (all roles; shareholders and non-shareholders). Pass isShareholder true for shareholders only (Shareholders page). */
export function useUsers(role?: string, isShareholder?: boolean) {
  const { token, isAuthenticated, user, isHydrated } = useAuth();
  const qs = new URLSearchParams();
  if (role) qs.set("role", role);
  if (isShareholder !== undefined) qs.set("is_shareholder", String(isShareholder));
  const suffix = qs.toString();
  const canListUsers = user?.portal_role === "superadmin" || user?.portal_role === "owner";
  return useQuery({
    queryKey: ["users", role, isShareholder, token],
    queryFn: () => apiGet<unknown[]>(`/api/users/${suffix ? `?${suffix}` : ""}`, token),
    enabled: Boolean(isAuthenticated && token && isHydrated && canListUsers),
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export function useSuperSettings() {
  const { token, isAuthenticated, user } = useAuth();
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["super-settings", token],
    queryFn: async () => {
      const data = await apiGet<SuperSettingsDTO>("/api/super-settings/", token);
      cacheSuperSettings(data);
      const subset: PlatformDefaultsDTO = {
        subscription_fee_per_month: data.subscription_fee_per_month,
        per_transaction_fee: data.per_transaction_fee,
        due_threshold: data.due_threshold,
        sms_per_usage: data.sms_per_usage,
        due_payment_qr: data.due_payment_qr ?? null,
      };
      cachePlatformDefaults(subset);
      qc.setQueryData(["platform-defaults", token], subset);
      return data;
    },
    placeholderData: () => readSuperSettingsCache() ?? undefined,
    enabled: isAuthenticated && user?.portal_role === "superadmin",
  });
}

export function useUpdateSuperSettings() {
  const qc = useQueryClient();
  const { token } = useAuth();
  return useMutation({
    mutationFn: (body: {
      subscription_fee_per_month?: number;
      per_transaction_fee?: number;
      due_threshold?: number;
      sms_per_usage?: number;
      due_payment_qr?: File | null;
    }) => {
      if (body.due_payment_qr instanceof File) {
        const fd = new FormData();
        if (body.subscription_fee_per_month != null) {
          fd.append("subscription_fee_per_month", String(body.subscription_fee_per_month));
        }
        if (body.per_transaction_fee != null) {
          fd.append("per_transaction_fee", String(body.per_transaction_fee));
        }
        if (body.due_threshold != null) {
          fd.append("due_threshold", String(body.due_threshold));
        }
        if (body.sms_per_usage != null) {
          fd.append("sms_per_usage", String(body.sms_per_usage));
        }
        fd.append("due_payment_qr", body.due_payment_qr);
        return apiPatchForm<SuperSettingsDTO>("/api/super-settings/", fd, token);
      }
      const { due_payment_qr: _qr, ...jsonBody } = body;
      return apiPatch<SuperSettingsDTO>("/api/super-settings/", jsonBody, token);
    },
    onSuccess: (data) => {
      cacheSuperSettings(data);
      const subset: PlatformDefaultsDTO = {
        subscription_fee_per_month: data.subscription_fee_per_month,
        per_transaction_fee: data.per_transaction_fee,
        due_threshold: data.due_threshold,
        sms_per_usage: data.sms_per_usage,
        due_payment_qr: data.due_payment_qr ?? null,
      };
      cachePlatformDefaults(subset);
      qc.setQueryData(["super-settings", token], data);
      qc.setQueryData(["platform-defaults", token], subset);
      void qc.invalidateQueries({ queryKey: ["platform-defaults"] });
    },
  });
}

export function usePlatformDefaults() {
  const { token, isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["platform-defaults", token],
    queryFn: async () => {
      const data = await apiGet<PlatformDefaultsDTO>("/api/platform-defaults/", token);
      cachePlatformDefaults(data);
      return data;
    },
    placeholderData: () => readPlatformDefaultsCache() ?? undefined,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
}

export function useWithdrawals() {
  const { token, isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["withdrawals", token],
    queryFn: () => apiGet<unknown[]>("/api/shareholder-withdrawals/", token),
    enabled: isAuthenticated,
  });
}

export function useCreateWithdrawalRequest() {
  const qc = useQueryClient();
  const { token, refreshUser } = useAuth();
  return useMutation({
    mutationFn: (body: { amount: string; remarks: string }) =>
      apiPost<unknown>("/api/shareholder-withdrawals/", body, token),
    onSuccess: async () => {
      void qc.invalidateQueries({ queryKey: ["withdrawals"] });
      void qc.invalidateQueries({ queryKey: ["me"] });
      await refreshUser();
    },
  });
}

export function useApproveShareholderWithdrawal() {
  const qc = useQueryClient();
  const { token, refreshUser } = useAuth();
  return useMutation({
    mutationFn: (id: number) => apiPost<unknown>(`/api/shareholder-withdrawals/${id}/approve/`, {}, token),
    onSuccess: async () => {
      void qc.invalidateQueries({ queryKey: ["withdrawals"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["me"] });
      await refreshUser();
    },
  });
}

export function useRejectShareholderWithdrawal() {
  const qc = useQueryClient();
  const { token, refreshUser } = useAuth();
  return useMutation({
    mutationFn: (args: { id: number; reason: string }) =>
      apiPost<unknown>(`/api/shareholder-withdrawals/${args.id}/reject/`, { reason: args.reason }, token),
    onSuccess: async () => {
      void qc.invalidateQueries({ queryKey: ["withdrawals"] });
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["me"] });
      await refreshUser();
    },
  });
}

export function useBulkNotifications(restaurantId: number | null) {
  const { token, isAuthenticated, user } = useAuth();
  const isSuper = user?.portal_role === "superadmin";
  const pr = user?.portal_role;
  const mayListForRestaurant =
    pr === "owner" || pr === "waiter" || pr === "cashier" || pr === "kitchen";
  const isPlatformInbox = pr === "customer" || pr === "shareholder";
  return useQuery({
    queryKey: ["bulk-notifications", restaurantId, isSuper, pr, token],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (restaurantId != null) qs.set("restaurant_id", String(restaurantId));
      const s = qs.toString();
      return apiGet<unknown[]>(`/api/bulk-notifications/${s ? `?${s}` : ""}`, token);
    },
    enabled:
      isAuthenticated &&
      (isSuper || isPlatformInbox || (restaurantId != null && mayListForRestaurant)),
    /** Customer/shareholder inboxes should pick up new bill notifications without a manual refresh. */
    refetchInterval: isPlatformInbox ? 20_000 : false,
    refetchIntervalInBackground: true,
  });
}

export function useCreateOwnerStaffNotification() {
  const qc = useQueryClient();
  const { token } = useAuth();
  return useMutation({
    mutationFn: (body: {
      restaurant_id: number;
      message: string;
      title?: string;
      link?: string;
      receiver_user_ids?: number[];
    }) => apiPost<unknown>("/api/bulk-notifications/create/", body, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["bulk-notifications"] });
    },
  });
}

export function useCreateSuperadminBulkNotification() {
  const qc = useQueryClient();
  const { token } = useAuth();
  return useMutation({
    mutationFn: (args: {
      message: string;
      type: "sms" | "push";
      title?: string;
      link?: string;
      /** Omit or leave empty for all active users except super admins. */
      receiver_user_ids?: number[];
      image?: File | null;
    }) => {
      const { image, receiver_user_ids, ...rest } = args;
      if (image) {
        const fd = new FormData();
        fd.append("message", rest.message);
        fd.append("type", rest.type);
        if (rest.title) fd.append("title", rest.title);
        if (rest.link) fd.append("link", rest.link);
        if (receiver_user_ids?.length) {
          fd.append("receiver_user_ids", JSON.stringify(receiver_user_ids));
        }
        fd.append("image", image);
        return apiPostForm<unknown>("/api/bulk-notifications/superadmin-create/", fd, token);
      }
      const body: Record<string, unknown> = {
        message: rest.message,
        type: rest.type,
        title: rest.title ?? "",
        link: rest.link ?? "",
      };
      if (receiver_user_ids?.length) body.receiver_user_ids = receiver_user_ids;
      return apiPost<unknown>("/api/bulk-notifications/superadmin-create/", body, token);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["bulk-notifications"] });
    },
  });
}

export function useProductRawMaterials(restaurantId: number | null) {
  const { token, isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["product-raw-materials", restaurantId, token],
    queryFn: () =>
      apiGet<unknown[]>(`/api/product-raw-materials/?restaurant_id=${restaurantId}`, token),
    enabled: isAuthenticated && restaurantId != null,
  });
}

export function usePublicRestaurants() {
  return useQuery({
    queryKey: ["public-restaurants"],
    queryFn: () => apiGet<unknown[]>("/api/restaurants/", null),
    staleTime: 60_000,
  });
}

export function useClientHome(restaurantId: number | null) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ["client-home", restaurantId, token],
    queryFn: () => apiGet<unknown>(`/api/client/home/?restaurant_id=${restaurantId}`, token),
    enabled: restaurantId != null,
  });
}

/** Parallel client home fetches; shares React Query cache with {@link useClientHome}. */
export function useClientHomes(restaurantIds: number[]) {
  const { token } = useAuth();
  return useQueries({
    queries: restaurantIds.map((restaurantId) => ({
      queryKey: ["client-home", restaurantId, token] as const,
      queryFn: () => apiGet<unknown>(`/api/client/home/?restaurant_id=${restaurantId}`, token),
      enabled: restaurantId > 0,
    })),
  });
}

export function useProximityAlerts(restaurantId: number | null, enabled: boolean) {
  const { token, isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["proximity-alerts", restaurantId, token],
    queryFn: () =>
      apiGet<unknown[]>(`/api/orders/proximity-alerts/?restaurant_id=${restaurantId}`, token),
    enabled: isAuthenticated && enabled && restaurantId != null,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });
}

/** Latest order per customer for the counter, including fully paid (same restaurant; staff, owner, super-admin). */
export function usePendingPaymentAlerts(restaurantId: number | null, enabled: boolean) {
  const { token, isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["payment-pending-alerts", restaurantId, token],
    queryFn: () =>
      apiGet<unknown[]>(`/api/orders/payment-pending-alerts/?restaurant_id=${restaurantId}`, token),
    enabled: isAuthenticated && enabled && restaurantId != null,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });
}

export function useDismissProximityAlert() {
  const qc = useQueryClient();
  const { token } = useAuth();
  return useMutation({
    mutationFn: (orderId: number) =>
      apiPost<unknown>(`/api/orders/${orderId}/dismiss-proximity-alert/`, {}, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["proximity-alerts"] });
      void qc.invalidateQueries({ queryKey: ["payment-pending-alerts"] });
      void qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

export type RecordOrderPaymentSuccessBody = {
  /** Counter-side channel; defaults to cash when omitted (backwards compatible). */
  channel?: "cash" | "qr";
  /** Installment toward the bill; omit to apply up to the remaining balance. */
  amount?: string;
};

/** Records cashier-side cash or QR/UPI settlement (full or partial); the counter list keeps the row with success. */
export function useRecordOrderPaymentSuccess() {
  const qc = useQueryClient();
  const { token } = useAuth();
  return useMutation({
    mutationFn: (vars: { orderId: number; body?: RecordOrderPaymentSuccessBody }) =>
      apiPost<unknown>(
        `/api/orders/${vars.orderId}/record-payment-success/`,
        vars.body ?? {},
        token,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["payment-pending-alerts"] });
      void qc.invalidateQueries({ queryKey: ["proximity-alerts"] });
      void qc.invalidateQueries({ queryKey: ["orders"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      void qc.invalidateQueries({ queryKey: ["customer-order-history"] });
    },
  });
}

/** All orders (including paid) for a customer at a restaurant; used on the payment counter. */
export function useCustomerOrderHistory(
  restaurantId: number | null,
  customerId: number | null | undefined,
  guestPhone: string | null | undefined,
  enabled: boolean,
) {
  const { token, isAuthenticated } = useAuth();
  const hasGuest = guestPhone != null && String(guestPhone).trim() !== "";
  return useQuery({
    queryKey: ["customer-order-history", restaurantId, customerId, guestPhone, token] as const,
    queryFn: () => {
      const q = new URLSearchParams();
      if (restaurantId != null) q.set("restaurant_id", String(restaurantId));
      if (customerId != null) q.set("customer", String(customerId));
      else if (hasGuest) q.set("guest_phone", String(guestPhone).trim());
      return apiGet<unknown[]>(`/api/orders/customer-order-history/?${q.toString()}`, token);
    },
    enabled:
      isAuthenticated &&
      enabled &&
      restaurantId != null &&
      (customerId != null || hasGuest),
    staleTime: 20_000,
  });
}

export type ScanBillItemResult = {
  item_name: string;
  estimated_price: number | null;
  confidence: number;
  suggested_menu_item: { product_item_id: number; label: string; unit_price: string } | null;
  used_ai: boolean;
  menu_matches: { product_item_id: number; label: string; unit_price: string }[];
  detail: string;
};

/** OpenAI (optional) + menu matching; multipart upload from the payment counter. */
export function useScanBillItem() {
  const { token } = useAuth();
  return useMutation({
    mutationFn: async (vars: { restaurantId: number; imageBlob: Blob }) => {
      const fd = new FormData();
      fd.append("restaurant_id", String(vars.restaurantId));
      fd.append("image", vars.imageBlob, "scan.jpg");
      return apiPostForm<ScanBillItemResult>("/api/orders/scan-bill-item/", fd, token);
    },
  });
}

export type ScanRawMaterialResult = {
  item_name: string;
  estimated_price: number | null;
  confidence: number;
  notes: string;
  unit_hint: string;
  suggested_unit_id: number | null;
  suggested_unit_label: string | null;
  existing_matches: { id: number; name: string; stock: string; unit_symbol?: string }[];
  used_ai: boolean;
  detail: string;
};

/** Optional OpenAI vision + unit hints; multipart image only — ``restaurant_id`` on query string. */
export function useScanRawMaterial() {
  const { token } = useAuth();
  return useMutation({
    mutationFn: async (vars: { restaurantId: number; imageBlob: Blob }) => {
      const fd = new FormData();
      fd.append("image", vars.imageBlob, "scan.jpg");
      return apiPostForm<ScanRawMaterialResult>(
        `/api/raw-materials/recognize/?restaurant_id=${vars.restaurantId}`,
        fd,
        token,
      );
    },
  });
}

export function useCreateRawMaterial() {
  const qc = useQueryClient();
  const { token } = useAuth();
  return useMutation({
    mutationFn: (vars: {
      restaurantId: number;
      body: { name: string; unit: number; price: string; stock: string; min_stock?: string };
    }) =>
      apiPost<unknown>(
        `/api/raw-materials/?restaurant_id=${vars.restaurantId}`,
        {
          name: vars.body.name,
          unit: vars.body.unit,
          price: vars.body.price,
          stock: vars.body.stock,
          min_stock: vars.body.min_stock ?? "0",
        },
        token,
      ),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["raw-materials", vars.restaurantId] });
      void qc.invalidateQueries({ queryKey: ["stock-logs"] });
    },
  });
}

export type AddBillLineBody = {
  product_item_id?: number | null;
  ad_hoc_label?: string;
  unit_price?: string;
  quantity?: string;
};

/** Add catalog or ad-hoc line; server recomputes subtotal, delivery, discount, and bill image. */
export function useAddBillLine() {
  const qc = useQueryClient();
  const { token } = useAuth();
  return useMutation({
    mutationFn: (vars: { orderId: number; body: AddBillLineBody }) =>
      apiPost<unknown>(`/api/orders/${vars.orderId}/add-bill-line/`, vars.body, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["payment-pending-alerts"] });
      void qc.invalidateQueries({ queryKey: ["orders"] });
      void qc.invalidateQueries({ queryKey: ["customer-order-history"] });
    },
  });
}
