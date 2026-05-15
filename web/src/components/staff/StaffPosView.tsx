import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { discountedUnitPrice } from "@/lib/pricing";
import { useClientHome } from "@/hooks/use-rest-api";
import { apiGet, apiPost, resolveMediaUrl } from "@/lib/api";
import { parseLocalPhone } from "@/lib/phone-validation";
import { MenuMediaThumb } from "@/components/shared/MenuMediaThumb";
import { useAuth } from "@/lib/auth-context";
import { LocationMapPicker } from "@/components/shared/LocationMapPicker";
import { Search, ShoppingCart, Minus, Plus, Users, Leaf, Circle, Package } from "lucide-react";
import type { DiscountType, OrderType } from "@/constants/enums";

export type StaffPosViewMode = "staff" | "public";

interface CategoryDTO {
  id: number;
  name: string;
  parent_id: number | null;
  image: string | null;
}
interface ProductDTO {
  id: number;
  name: string;
  category_id: number | null;
  is_veg: boolean;
  is_active: boolean;
  image: string | null;
}
interface ProductItemDTO {
  id: number;
  product_id: number;
  unit__name: string;
  price: string | number;
  discount_type: DiscountType;
  discount: string | number;
}
interface TableDTO {
  id: number;
  name: string;
  capacity: number;
  image?: string | null;
}
interface ComboSetDTO {
  id: number;
  name: string;
  description: string;
  price: string | number;
  products: number[];
  image: string | null;
}

interface HomePayload {
  restaurant?: { id: number; name: string; slug: string };
  categories: CategoryDTO[];
  products: ProductDTO[];
  product_items: ProductItemDTO[];
  tables: TableDTO[];
  combo_sets?: ComboSetDTO[];
}

type CartLine =
  | {
      kind: "product";
      productId: number;
      productItemId: number;
      name: string;
      unit: string;
      price: number;
      quantity: number;
      imageUrl?: string | null;
    }
  | {
      kind: "combo";
      comboSetId: number;
      name: string;
      price: number;
      quantity: number;
      imageUrl?: string | null;
    };

/** `all` = every category + combo sets; `combo` = combo sets only; number = category id. */
type MenuTab = "all" | "combo" | number;

type PortionLayout =
  | { kind: "half_full"; half: ProductItemDTO; full: ProductItemDTO }
  | { kind: "single"; item: ProductItemDTO }
  | { kind: "choice"; items: ProductItemDTO[] };

function portionLayout(items: ProductItemDTO[]): PortionLayout | null {
  if (items.length === 0) return null;
  const half = items.find((i) => /\bhalf\b/i.test(i.unit__name) || i.unit__name.toLowerCase().includes("half"));
  const full = items.find((i) => /\bfull\b/i.test(i.unit__name) || i.unit__name.toLowerCase().includes("full"));
  if (half && full) return { kind: "half_full", half, full };
  if (items.length === 1) return { kind: "single", item: items[0] };
  return { kind: "choice", items };
}

export function StaffPosView({
  restaurantId,
  mode,
}: {
  restaurantId: number | null;
  mode: StaffPosViewMode;
}) {
  const { token, user, role } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useClientHome(restaurantId);
  const payload = data as HomePayload | undefined;

  const [menuTab, setMenuTab] = useState<MenuTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [orderType, setOrderType] = useState<OrderType>("table");
  const [peopleFor, setPeopleFor] = useState(1);
  const [placing, setPlacing] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [deliveryLatitude, setDeliveryLatitude] = useState("");
  const [deliveryLongitude, setDeliveryLongitude] = useState("");
  const [portionItemByProduct, setPortionItemByProduct] = useState<Record<number, number | null>>({});

  const [linkedCustomerId, setLinkedCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const isWaiter = mode === "public" ? true : role === "waiter";
  const orderTypeOptions = useMemo((): readonly OrderType[] => (isWaiter ? (["table", "packing"] as const) : (["table", "packing", "delivery"] as const)), [isWaiter]);

  const { data: restaurantRows = [] } = useQuery({
    queryKey: ["restaurants", "staff-pos"],
    queryFn: () =>
      apiGet<
        Array<{
          id: number;
          latitude?: string | number | null;
          longitude?: string | number | null;
          effective_per_transaction_fee?: string | number;
        }>
      >("/api/restaurants/", token ?? null),
    staleTime: 60_000,
    enabled: restaurantId != null,
  });
  const posRestaurant = restaurantRows.find((r) => r.id === restaurantId) ?? null;

  const { data: customerRows = [] } = useQuery({
    queryKey: ["customers", "pos", restaurantId],
    queryFn: () => apiGet<Array<{ id: number; name: string; phone: string }>>(`/api/customers/?restaurant_id=${restaurantId}`),
    staleTime: 60_000,
    enabled: restaurantId != null && Boolean(token),
  });

  useEffect(() => {
    if (orderType !== "delivery") return;
    if (!deliveryLatitude && !deliveryLongitude && posRestaurant?.latitude != null && posRestaurant?.longitude != null) {
      setDeliveryLatitude(String(posRestaurant.latitude));
      setDeliveryLongitude(String(posRestaurant.longitude));
    }
  }, [orderType, posRestaurant, deliveryLatitude, deliveryLongitude]);

  useEffect(() => {
    if (isWaiter && orderType === "delivery") {
      setOrderType("table");
    }
  }, [isWaiter, orderType]);

  const categories = payload?.categories ?? [];
  const products = payload?.products ?? [];
  const productItems = payload?.product_items ?? [];
  const tables = payload?.tables ?? [];
  const comboSets = payload?.combo_sets ?? [];

  const loadError = error instanceof Error ? error.message : error ? String(error) : null;

  const filteredProducts = products.filter((p) => {
    if (!p.is_active) return false;
    if (menuTab === "combo") return false;
    if (typeof menuTab === "number" && p.category_id !== menuTab) return false;
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const filteredCombos = comboSets.filter((c) => {
    if (menuTab !== "all" && menuTab !== "combo") return false;
    if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const addProductToCart = (
    productId: number,
    productItemId: number,
    name: string,
    unit: string,
    unitPrice: number,
    discountType: DiscountType,
    discount: number,
    productImagePath?: string | null,
  ) => {
    const price = discountedUnitPrice(unitPrice, discountType, discount);
    const imageUrl = resolveMediaUrl(productImagePath ?? null);
    setCart((prev) => {
      const e = prev.find((x) => x.kind === "product" && x.productItemId === productItemId);
      if (e && e.kind === "product") {
        return prev.map((x) =>
          x.kind === "product" && x.productItemId === productItemId ? { ...x, quantity: x.quantity + 1 } : x,
        );
      }
      return [
        ...prev,
        {
          kind: "product" as const,
          productId,
          productItemId,
          name,
          unit,
          price,
          quantity: 1,
          imageUrl: imageUrl ?? undefined,
        },
      ];
    });
  };

  const addComboToCart = (combo: ComboSetDTO) => {
    const unitPrice = typeof combo.price === "string" ? Number.parseFloat(combo.price) : combo.price;
    const price = Number.isFinite(unitPrice) ? unitPrice : 0;
    const imageUrl = resolveMediaUrl(combo.image ?? null);
    setCart((prev) => {
      const e = prev.find((x) => x.kind === "combo" && x.comboSetId === combo.id);
      if (e && e.kind === "combo") {
        return prev.map((x) =>
          x.kind === "combo" && x.comboSetId === combo.id ? { ...x, quantity: x.quantity + 1 } : x,
        );
      }
      return [
        ...prev,
        {
          kind: "combo" as const,
          comboSetId: combo.id,
          name: combo.name,
          price,
          quantity: 1,
          imageUrl: imageUrl ?? undefined,
        },
      ];
    });
  };

  const updateQty = (line: CartLine, d: number) => {
    const idKey = line.kind === "product" ? line.productItemId : line.comboSetId;
    setCart((prev) =>
      prev
        .map((c) => {
          if (line.kind === "product" && c.kind === "product" && c.productItemId === idKey) {
            return { ...c, quantity: Math.max(0, c.quantity + d) };
          }
          if (line.kind === "combo" && c.kind === "combo" && c.comboSetId === idKey) {
            return { ...c, quantity: Math.max(0, c.quantity + d) };
          }
          return c;
        })
        .filter((c) => c.quantity > 0),
    );
  };
  const subTotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);

  const serviceCharge = useMemo(() => {
    const raw = posRestaurant?.effective_per_transaction_fee;
    const n = raw != null ? Number(raw) : 0;
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
  }, [posRestaurant?.effective_per_transaction_fee]);

  const grandTotal = useMemo(
    () => Math.round((subTotal + (cart.length > 0 ? serviceCharge : 0)) * 100) / 100,
    [subTotal, serviceCharge, cart.length],
  );

  const resolveSelectedItemId = (productId: number, layout: PortionLayout): number | null => {
    if (layout.kind === "single") return layout.item.id;
    const fromState = portionItemByProduct[productId];
    if (layout.kind === "half_full") {
      return fromState ?? null;
    }
    return fromState ?? layout.items[0]?.id ?? null;
  };

  const handleAddProduct = (product: ProductDTO, layout: PortionLayout) => {
    const itemId = resolveSelectedItemId(product.id, layout);
    if (itemId == null) return;
    const item = productItems.find((pi) => pi.id === itemId);
    if (!item) return;
    const unitPrice = typeof item.price === "string" ? Number.parseFloat(item.price) : item.price;
    const disc = typeof item.discount === "string" ? Number.parseFloat(item.discount) : item.discount;
    addProductToCart(product.id, item.id, product.name, item.unit__name, unitPrice, item.discount_type, disc, product.image);
  };

  const onPickRegisteredCustomer = (idStr: string) => {
    if (!idStr) {
      setLinkedCustomerId(null);
      return;
    }
    const id = Number.parseInt(idStr, 10);
    const row = customerRows.find((c) => c.id === id);
    setLinkedCustomerId(Number.isFinite(id) ? id : null);
    if (row) {
      setCustomerName(row.name ?? "");
      setCustomerPhone(row.phone ?? "");
    }
  };

  const placeOrder = async () => {
    if (restaurantId == null) return;
    setOrderError(null);
    if (cart.length === 0) {
      setOrderError("Add at least one item to the cart.");
      return;
    }
    if (orderType === "table" && selectedTable == null) {
      setOrderError("Select a table for dine-in orders.");
      return;
    }
    if (mode !== "public" && orderType === "delivery") {
      const dLat = Number.parseFloat(deliveryLatitude);
      const dLng = Number.parseFloat(deliveryLongitude);
      if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) {
        setOrderError("Set the delivery drop-off pin on the map.");
        return;
      }
    }
    let guestPhoneDigits = "";
    if (linkedCustomerId == null) {
      if (!customerName.trim() || !customerPhone.trim()) {
        setOrderError("Enter customer name and phone, or select a registered customer.");
        return;
      }
      const parsed = parseLocalPhone(customerPhone);
      if (!parsed.ok) {
        setOrderError(parsed.message);
        return;
      }
      guestPhoneDigits = parsed.digits;
    }

    if (mode === "public") {
      setPlacing(true);
      try {
        await apiPost(
          "/api/client/orders/",
          {
            restaurant: restaurantId,
            lines: cart.map((c) =>
              c.kind === "product"
                ? { product_item_id: c.productItemId, quantity: String(c.quantity) }
                : { comboset_id: c.comboSetId, quantity: String(c.quantity) },
            ),
            order_type: orderType,
            table: (orderType === "table" || orderType === "packing") ? selectedTable : null,
            people_for: peopleFor,
            guest_customer_name: customerName.trim(),
            guest_customer_phone: guestPhoneDigits,
          },
          null,
        );
        setCart([]);
        setLinkedCustomerId(null);
        setCustomerName("");
        setCustomerPhone("");
        void queryClient.invalidateQueries({ queryKey: ["client-home", restaurantId] });
      } catch (e) {
        setOrderError(e instanceof Error ? e.message : "Could not place order.");
      } finally {
        setPlacing(false);
      }
      return;
    }

    if (!token) return;
    setPlacing(true);
    try {
      await apiPost(
        "/api/orders/",
        {
          restaurant: restaurantId,
          lines: cart.map((c) =>
            c.kind === "product"
              ? { product_item_id: c.productItemId, quantity: String(c.quantity) }
              : { comboset_id: c.comboSetId, quantity: String(c.quantity) },
          ),
          order_type: orderType,
          table: (orderType === "table" || orderType === "packing") ? selectedTable : null,
          people_for: peopleFor,
          waiter: user?.id ?? null,
          address: orderType === "delivery" ? "Staff POS delivery" : "",
          latitude: orderType === "delivery" ? Number.parseFloat(deliveryLatitude) : null,
          longitude: orderType === "delivery" ? Number.parseFloat(deliveryLongitude) : null,
          customer: linkedCustomerId,
          guest_customer_name: linkedCustomerId ? "" : customerName.trim(),
          guest_customer_phone: linkedCustomerId ? "" : guestPhoneDigits,
        },
        token,
      );
      setCart([]);
      setLinkedCustomerId(null);
      setCustomerName("");
      setCustomerPhone("");
      void queryClient.invalidateQueries({ queryKey: ["orders", restaurantId] });
      void queryClient.invalidateQueries({ queryKey: ["client-home", restaurantId] });
    } catch (e) {
      setOrderError(e instanceof Error ? e.message : "Could not place order.");
    } finally {
      setPlacing(false);
    }
  };

  const emptyMessage =
    mode === "public"
      ? "This menu link is missing a valid restaurant."
      : "No restaurant context. Log in as staff assigned to a restaurant.";

  if (restaurantId == null) {
    return <p className="text-sm text-text-muted p-4">{emptyMessage}</p>;
  }

  /**
   * Let height follow content so the staff portal `main` (overflow-y-auto) is the single vertical
   * scroll surface — users can always scroll to totals + Place Order. Avoid nested max-h /
   * overflow-y traps that clip the order footer (previously max-h-screen + flex-1 cart only).
   */
  const rootClass =
    mode === "public"
      ? "flex min-h-0 flex-1 flex-col lg:flex-row lg:items-start"
      : "flex w-full flex-col lg:flex-row lg:items-start max-lg:pb-[var(--app-mobile-bottom-nav-scroll-padding)]";

  const inner = (
    <div className={`${rootClass} ${mode === "staff" ? "-m-4 lg:-m-6" : ""}`}>
      <div className="flex min-w-0 flex-1 flex-col">
        {payload?.restaurant?.name ? (
          <div className="px-4 py-2 text-xs text-text-muted border-b border-border bg-surface-alt/50">
            Menu for <span className="font-semibold text-foreground">{payload.restaurant.name}</span>
          </div>
        ) : null}
        <div className="bg-card border-b border-border px-4 py-2 flex gap-2 overflow-x-auto items-center">
          <button
            type="button"
            onClick={() => setMenuTab("all")}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${menuTab === "all" ? "bg-primary text-primary-foreground" : "bg-surface-alt text-text-secondary"}`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setMenuTab("combo")}
            className={`inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap border border-transparent ${
              menuTab === "combo" ? "bg-primary text-primary-foreground" : "bg-surface-alt text-text-secondary border-border/60"
            }`}
          >
            <span className="w-8 h-8 rounded-full overflow-hidden shrink-0 ring-1 ring-black/5 bg-primary-50 flex items-center justify-center">
              <Package size={16} className="text-primary" />
            </span>
            Combo Set
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setMenuTab(c.id)}
              className={`inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap border border-transparent ${
                menuTab === c.id ? "bg-primary text-primary-foreground" : "bg-surface-alt text-text-secondary border-border/60"
              }`}
            >
              <span className="w-8 h-8 rounded-full overflow-hidden shrink-0 ring-1 ring-black/5">
                <MenuMediaThumb
                  mediaPath={c.image}
                  alt={c.name}
                  className="h-full w-full min-h-0"
                  fallback={<span className="text-sm">📂</span>}
                />
              </span>
              {c.name}
            </button>
          ))}
        </div>
        <div className="px-4 py-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search menu…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-card text-sm focus:border-primary outline-none"
            />
          </div>
        </div>
        <div className="grid auto-rows-min grid-cols-2 gap-3 px-4 pb-4 sm:grid-cols-3 lg:grid-cols-4">
          {isLoading && <div className="col-span-full text-sm text-text-muted">Loading menu...</div>}
          {loadError && <div className="col-span-full text-sm text-error">{loadError}</div>}
          {!isLoading &&
            !loadError &&
            filteredProducts.length === 0 &&
            filteredCombos.length === 0 && (
              <div className="col-span-full text-sm text-text-muted py-8 text-center">No menu items match your search.</div>
            )}
          {filteredProducts.map((product) => {
            const items = productItems.filter((pi) => pi.product_id === product.id);
            const layout = portionLayout(items);
            if (!layout) {
              return (
                <div
                  key={product.id}
                  className="bg-card rounded-xl border border-border overflow-hidden opacity-60"
                >
                  <div className="p-3">
                    <p className="text-sm font-semibold text-foreground truncate">{product.name}</p>
                    <p className="text-xs text-text-muted mt-2">No portions configured</p>
                  </div>
                </div>
              );
            }

            const selectedItemId = resolveSelectedItemId(product.id, layout);
            const addDisabled = selectedItemId == null;

            return (
              <div
                key={product.id}
                className="bg-card rounded-xl border border-border overflow-hidden hover:shadow-md transition-shadow flex flex-col"
              >
                <div className="h-28 relative shrink-0">
                  <MenuMediaThumb mediaPath={product.image} alt={product.name} className="h-full w-full" />
                  <div className="absolute top-2 right-2">
                    {product.is_veg ? (
                      <Leaf size={14} className="text-success drop-shadow-sm" />
                    ) : (
                      <Circle size={14} className="text-error fill-error drop-shadow-sm" />
                    )}
                  </div>
                </div>
                <div className="p-3 flex flex-col flex-1 gap-2">
                  <p className="text-sm font-semibold text-foreground truncate">{product.name}</p>

                  {layout.kind === "half_full" ? (
                    <div className="flex gap-1 p-0.5 rounded-lg bg-surface">
                      <button
                        type="button"
                        onClick={() =>
                          setPortionItemByProduct((prev) => ({ ...prev, [product.id]: layout.half.id }))
                        }
                        className={`flex-1 py-1.5 rounded-md text-xs font-semibold ${
                          selectedItemId === layout.half.id ? "bg-primary text-primary-foreground" : "text-text-secondary"
                        }`}
                      >
                        Half
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPortionItemByProduct((prev) => ({ ...prev, [product.id]: layout.full.id }))
                        }
                        className={`flex-1 py-1.5 rounded-md text-xs font-semibold ${
                          selectedItemId === layout.full.id ? "bg-primary text-primary-foreground" : "text-text-secondary"
                        }`}
                      >
                        Full
                      </button>
                    </div>
                  ) : null}

                  {layout.kind === "choice" ? (
                    <div className="flex flex-col gap-1">
                      {layout.items.map((item) => {
                        const unitPrice = typeof item.price === "string" ? Number.parseFloat(item.price) : item.price;
                        const disc = typeof item.discount === "string" ? Number.parseFloat(item.discount) : item.discount;
                        const line = discountedUnitPrice(unitPrice, item.discount_type, disc);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setPortionItemByProduct((prev) => ({ ...prev, [product.id]: item.id }))}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left border ${
                              selectedItemId === item.id
                                ? "border-primary bg-primary-50"
                                : "border-border bg-surface-alt/60"
                            }`}
                          >
                            <span className="text-xs text-text-secondary">{item.unit__name}</span>
                            <span className="text-xs font-bold text-primary">₹{line.toLocaleString()}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  {layout.kind === "single" ? (
                    <p className="text-xs text-text-secondary">
                      {layout.item.unit__name} · ₹
                      {discountedUnitPrice(
                        typeof layout.item.price === "string" ? Number.parseFloat(layout.item.price) : layout.item.price,
                        layout.item.discount_type,
                        typeof layout.item.discount === "string" ? Number.parseFloat(layout.item.discount) : layout.item.discount,
                      ).toLocaleString()}
                    </p>
                  ) : null}

                  <button
                    type="button"
                    disabled={addDisabled}
                    onClick={() => handleAddProduct(product, layout)}
                    className="mt-auto w-full py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary-600 disabled:opacity-45 disabled:pointer-events-none"
                  >
                    Add
                  </button>
                </div>
              </div>
            );
          })}
          {filteredCombos.map((combo) => (
            <div
              key={`combo-${combo.id}`}
              className="bg-card rounded-xl border border-border overflow-hidden hover:shadow-md transition-shadow flex flex-col ring-1 ring-primary/10"
            >
              <div className="h-28 relative shrink-0 bg-gradient-to-br from-primary-50 to-surface-alt">
                <MenuMediaThumb
                  mediaPath={combo.image}
                  alt={combo.name}
                  className="h-full w-full"
                  fallback={
                    <div className="flex h-full w-full items-center justify-center">
                      <Package size={36} className="text-primary/70" />
                    </div>
                  }
                />
              </div>
              <div className="p-3 flex flex-col flex-1 gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Combo set</p>
                <p className="text-sm font-semibold text-foreground line-clamp-2">{combo.name}</p>
                {combo.description ? (
                  <p className="text-xs text-text-muted line-clamp-2">{combo.description}</p>
                ) : null}
                <p className="text-xs font-bold text-primary">
                  ₹
                  {(typeof combo.price === "string" ? Number.parseFloat(combo.price) : Number(combo.price)).toLocaleString()}
                </p>
                <button
                  type="button"
                  onClick={() => addComboToCart(combo)}
                  className="mt-auto w-full py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary-600"
                >
                  Add
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="w-full shrink-0 border-t border-border bg-card lg:w-96 lg:max-w-[24rem] lg:border-l lg:border-t-0">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-md flex items-center gap-2">
              <ShoppingCart size={18} /> Order
            </h2>
            <span className="text-xs text-text-muted bg-surface px-2 py-1 rounded-full">{cart.length} items</span>
          </div>
          <div className="flex gap-1 mb-3 p-1 rounded-xl bg-surface">
            {orderTypeOptions.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setOrderType(t)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize ${orderType === t ? "bg-primary text-primary-foreground shadow-sm" : "text-text-secondary"}`}
              >
                {t}
              </button>
            ))}
          </div>
          {(orderType === "table" || orderType === "packing") && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 mb-3">
              {tables.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTable(t.id)}
                  className={`flex flex-col items-stretch gap-1 p-1.5 rounded-lg text-xs font-medium border ${selectedTable === t.id ? "border-primary bg-primary-50 text-primary" : "border-border text-text-secondary"}`}
                >
                  <MenuMediaThumb
                    mediaPath={t.image ?? null}
                    alt={t.name}
                    className="h-11 w-full min-h-0 rounded-md border border-border/80"
                  />
                  <span className="truncate text-center leading-tight">{t.name}</span>
                </button>
              ))}
            </div>
          )}
          {orderType === "delivery" && (
            <div className="mb-3 space-y-1">
              <p className="text-[10px] text-text-muted font-medium uppercase tracking-wide">Delivery pin</p>
              <LocationMapPicker
                latitude={deliveryLatitude}
                longitude={deliveryLongitude}
                defaultLatitude={posRestaurant?.latitude ?? null}
                defaultLongitude={posRestaurant?.longitude ?? null}
                onCoordinatesChange={(lat, lng) => {
                  setDeliveryLatitude(lat);
                  setDeliveryLongitude(lng);
                }}
                className="h-[160px]"
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Users size={14} className="text-text-muted" />
            <span className="text-xs text-text-secondary">People:</span>
            <button
              type="button"
              onClick={() => setPeopleFor(Math.max(1, peopleFor - 1))}
              className="w-6 h-6 rounded bg-surface flex items-center justify-center"
            >
              <Minus size={12} />
            </button>
            <span className="text-sm font-semibold w-6 text-center">{peopleFor}</span>
            <button
              type="button"
              onClick={() => setPeopleFor(peopleFor + 1)}
              className="w-6 h-6 rounded bg-surface flex items-center justify-center"
            >
              <Plus size={12} />
            </button>
          </div>
        </div>
        <div className="space-y-2 px-4 py-2">
          {cart.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-text-muted text-sm">No items added</div>
          ) : (
            cart.map((item) => (
              <div
                key={item.kind === "product" ? `p-${item.productItemId}` : `c-${item.comboSetId}`}
                className="flex items-center gap-3 py-2 border-b border-border last:border-0"
              >
                <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0 border border-border bg-surface-alt">
                  <MenuMediaThumb
                    mediaPath={item.imageUrl ?? null}
                    alt={item.name}
                    className="h-full w-full min-h-0"
                    fallback={item.kind === "combo" ? <span className="text-lg">🍱</span> : undefined}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-text-muted">
                    {item.kind === "product" ? item.unit : "Combo set"} · ₹{item.price}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => updateQty(item, -1)}
                    className="w-7 h-7 rounded-lg bg-surface flex items-center justify-center"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="text-sm font-semibold w-5 text-center">{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() => updateQty(item, 1)}
                    className="w-7 h-7 rounded-lg bg-surface flex items-center justify-center"
                  >
                    <Plus size={12} />
                  </button>
                </div>
                <span className="text-sm font-bold font-mono w-16 text-right">
                  ₹{(item.price * item.quantity).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
        {cart.length > 0 ? (
          <div className="border-t border-border px-4 py-3 space-y-3 bg-surface-alt/30">
            <p className="text-[10px] text-text-muted font-medium uppercase tracking-wide">Customer</p>
            <div className="space-y-1.5">
              <label className="text-[10px] text-text-muted font-medium uppercase tracking-wide block">
                Registered customer
              </label>
              <select
                className="w-full h-9 px-2 rounded-lg border border-border bg-card text-xs"
                value={linkedCustomerId ?? ""}
                onChange={(e) => onPickRegisteredCustomer(e.target.value)}
              >
                <option value="">Walk-in — enter name and phone below</option>
                {customerRows.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.phone})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-text-muted font-medium uppercase tracking-wide">Name</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  setLinkedCustomerId(null);
                }}
                placeholder="Customer name"
                className="w-full h-9 px-3 rounded-lg border border-border bg-card text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-text-muted font-medium uppercase tracking-wide">Phone</label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => {
                  setCustomerPhone(e.target.value);
                  setLinkedCustomerId(null);
                }}
                placeholder="Phone number"
                className="w-full h-9 px-3 rounded-lg border border-border bg-card text-sm outline-none focus:border-primary"
              />
            </div>
          </div>
        ) : null}
        <div className="space-y-2 border-t border-border px-4 py-3 pb-[max(1rem,calc(0.75rem+env(safe-area-inset-bottom)))]">
          {orderError && <p className="text-xs text-error">{orderError}</p>}
          <div className="flex justify-between text-sm text-text-secondary">
            <span>Sub Total</span>
            <span className="font-mono">₹{subTotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm text-text-secondary">
            <span>Service charge</span>
            <span className="font-mono">₹{(cart.length > 0 ? serviceCharge : 0).toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-md font-bold border-t border-border pt-2">
            <span>Total</span>
            <span className="font-mono">₹{grandTotal.toLocaleString()}</span>
          </div>
          <button
            type="button"
            disabled={placing || cart.length === 0}
            onClick={() => void placeOrder()}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary-600 mt-2 disabled:opacity-50 disabled:pointer-events-none"
          >
            {placing ? "Placing…" : "Place Order"}
          </button>
        </div>
      </div>
    </div>
  );

  if (mode === "public") {
    return (
      <div className="flex min-h-screen flex-col bg-surface">
        <div className="w-full shrink-0 border-b border-border bg-primary-50/80 px-4 py-2 text-center text-xs text-text-secondary">
          Scan-to-order menu — add items, enter your name and phone, then place your order. No account required.
        </div>
        {inner}
      </div>
    );
  }

  return inner;
}
