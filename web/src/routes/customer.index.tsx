import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useLocationCheck, type RestaurantRow } from "@/hooks/use-location-check";
import { useClientHome, useClientHomes } from "@/hooks/use-rest-api";
import { Search, Leaf, Circle, ShoppingCart, MapPin, Store, Loader2, Minus, Plus, ChevronRight } from "lucide-react";
import { discountedUnitPrice, listCatalogUnitPrice } from "@/lib/pricing";
import type { DiscountType } from "@/constants/enums";
import { readCustomerCart, writeCustomerCart, type CustomerCartLine } from "@/lib/customer-cart";
import { resolveMediaUrl } from "@/lib/api";
import { MenuMediaThumb } from "@/components/shared/MenuMediaThumb";

interface HomePayload {
  restaurant?: { id: number; name: string; slug: string; is_open?: boolean };
  categories: Array<{ id: number; name: string; parent_id: number | null; image: string | null }>;
  products: Array<{
    id: number;
    name: string;
    category_id: number | null;
    is_veg: boolean;
    is_active: boolean;
    image: string | null;
  }>;
  product_items: Array<{
    id: number;
    product_id: number;
    unit__name: string;
    price: string | number;
    discount_type: DiscountType;
    discount: string | number;
  }>;
  combo_sets: Array<{
    id: number;
    name: string;
    description: string;
    price: string;
    products: number[];
    image: string | null;
  }>;
}

function productLineForCustomerCart(
  restaurantId: number,
  product: HomePayload["products"][number],
  productItem: HomePayload["product_items"][number],
  imageUrl: string | null | undefined,
): Extract<CustomerCartLine, { kind: "product" }> {
  const raw = typeof productItem.price === "string" ? Number.parseFloat(productItem.price) : productItem.price;
  const disc = typeof productItem.discount === "string" ? Number.parseFloat(productItem.discount) : productItem.discount;
  const final = discountedUnitPrice(raw, productItem.discount_type, disc);
  const listUnitPrice = listCatalogUnitPrice(raw, productItem.discount_type, disc);
  return {
    kind: "product",
    restaurantId,
    productId: product.id,
    productItemId: productItem.id,
    name: product.name,
    unitLabel: productItem.unit__name,
    unitPrice: final,
    ...(listUnitPrice != null ? { listUnitPrice } : {}),
    quantity: 1,
    imageUrl: imageUrl ?? null,
  };
}

const PREVIEW_RESTAURANT_COUNT = 5;

export const Route = createFileRoute("/customer/")({
  validateSearch: (search: Record<string, unknown>) => ({
    restaurantId:
      typeof search.restaurantId === "number"
        ? search.restaurantId
        : typeof search.restaurantId === "string" && Number.isFinite(Number(search.restaurantId))
          ? Number(search.restaurantId)
          : undefined,
  }),
  component: CustomerHome,
});

function useDeliveryHomeCart() {
  const [cartLines, setCartLines] = useState<CustomerCartLine[]>(() => readCustomerCart());

  useEffect(() => {
    setCartLines(readCustomerCart());
  }, []);

  const addToCart = useCallback((line: CustomerCartLine) => {
    const prev = readCustomerCart();
    const sameRestaurant = prev.filter((x) => x.restaurantId === line.restaurantId);
    const cartBase = sameRestaurant.length > 0 ? sameRestaurant : [];
    const idx = cartBase.findIndex((x) => {
      if (x.kind !== line.kind) return false;
      if (x.kind === "product" && line.kind === "product") return x.productItemId === line.productItemId;
      if (x.kind === "combo" && line.kind === "combo") return x.comboSetId === line.comboSetId;
      return false;
    });
    if (idx >= 0) {
      const next = [...cartBase];
      next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 } as CustomerCartLine;
      writeCustomerCart(next);
      setCartLines(next);
      return;
    }
    const next = [...cartBase, line];
    writeCustomerCart(next);
    setCartLines(next);
  }, []);

  const updateCartQuantity = useCallback(
    (restaurantId: number, matcher: (line: CustomerCartLine) => boolean, buildLine: () => CustomerCartLine, delta: number) => {
      const current = readCustomerCart().filter((line) => line.restaurantId === restaurantId);
      const index = current.findIndex(matcher);
      if (index === -1 && delta > 0) {
        const next = [...current, buildLine()];
        writeCustomerCart(next);
        setCartLines(next);
        return;
      }
      if (index === -1) return;
      const row = current[index];
      const quantity = row.quantity + delta;
      const next = [...current];
      if (quantity <= 0) {
        next.splice(index, 1);
      } else {
        next[index] = { ...row, quantity };
      }
      writeCustomerCart(next);
      setCartLines(next);
    },
    [],
  );

  return { cartLines, addToCart, updateCartQuantity };
}

function CustomerDeliveryHome({
  activeRestaurants,
  navigate,
  setSelectedRestaurantId,
}: {
  activeRestaurants: RestaurantRow[];
  navigate: ReturnType<typeof useNavigate>;
  setSelectedRestaurantId: (id: number | null) => void;
}) {
  const previewRestaurants = useMemo(
    () => activeRestaurants.slice(0, PREVIEW_RESTAURANT_COUNT),
    [activeRestaurants],
  );
  const previewIds = useMemo(() => previewRestaurants.map((r) => r.id), [previewRestaurants]);
  const homeQueries = useClientHomes(previewIds);
  const { cartLines, addToCart, updateCartQuantity } = useDeliveryHomeCart();

  const featuredCombos = useMemo(() => {
    const out: Array<{ restaurantId: number; restaurantName: string; combo: HomePayload["combo_sets"][number] }> = [];
    previewRestaurants.forEach((r, i) => {
      const payload = homeQueries[i]?.data as HomePayload | undefined;
      for (const combo of payload?.combo_sets ?? []) {
        out.push({ restaurantId: r.id, restaurantName: r.name, combo });
      }
    });
    return out;
  }, [previewRestaurants, homeQueries]);

  const homesLoading = previewRestaurants.length > 0 && homeQueries.some((q) => q.isPending);

  const openRestaurant = (r: RestaurantRow) => {
    setSelectedRestaurantId(r.id);
    void navigate({
      to: "/customer",
      search: (prev) => ({ ...prev, restaurantId: r.id }),
    });
  };

  return (
    <>
      <div className="bg-primary px-4 pt-12 pb-6 rounded-b-3xl">
        <div className="flex items-center gap-2 mb-1">
          <MapPin size={16} className="text-primary-foreground/70" />
          <span className="text-xs text-primary-foreground/70">Delivery Mode</span>
        </div>
        <h1 className="font-display font-bold text-xl text-primary-foreground mb-4">Order Food Online</h1>
        <p className="text-xs text-primary-foreground/80 mb-3">Browse combo deals and menus from nearby restaurants.</p>
      </div>

      <div className="px-4 pt-5 pb-2">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="font-display font-semibold text-md text-foreground">Combo sets</h2>
          {homesLoading ? <Loader2 size={18} className="text-primary animate-spin shrink-0" aria-label="Loading" /> : null}
        </div>
        {featuredCombos.length === 0 && !homesLoading ? (
          <p className="text-sm text-text-muted py-1">No combo sets available from featured restaurants right now.</p>
        ) : featuredCombos.length > 0 ? (
          <div className="-mx-4 px-4 flex gap-3 overflow-x-auto pb-3 scroll-smooth snap-x snap-mandatory">
            {featuredCombos.map(({ restaurantId, restaurantName, combo }) => (
              <FeaturedComboCard
                key={`${restaurantId}-${combo.id}`}
                restaurantId={restaurantId}
                restaurantName={restaurantName}
                combo={combo}
                cartLines={cartLines}
                addToCart={addToCart}
                updateCartQuantity={updateCartQuantity}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="px-4 pb-4 pt-2 border-t border-border/60">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="font-display font-semibold text-md text-foreground">Restaurants</h2>
          {activeRestaurants.length > PREVIEW_RESTAURANT_COUNT ? (
            <Link
              to="/customer/restaurants"
              className="text-xs font-semibold text-primary flex items-center gap-0.5 shrink-0 hover:underline underline-offset-2"
            >
              View All
              <ChevronRight size={14} className="shrink-0" aria-hidden />
            </Link>
          ) : null}
        </div>
        <div className="space-y-3">
          {previewRestaurants.length === 0 ? (
            <p className="text-sm text-text-muted">No delivery restaurants available right now.</p>
          ) : (
            previewRestaurants.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => openRestaurant(r)}
                className="w-full bg-card rounded-xl border border-border p-4 flex items-center gap-4 text-left hover:shadow-sm transition-shadow"
              >
                <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
                  <Store size={24} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{r.name}</p>
                  <p className="text-xs text-text-muted truncate">{r.address}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusBadge status={r.is_open ? "open" : "closed"} />
                    {r.can_delivery ? <span className="text-[10px] text-success font-medium">🚚 Delivery</span> : null}
                    {r.can_delivery && r.delivery_radius_km != null ? (
                      <span className="text-[10px] text-text-muted">
                        Inside {Number(r.delivery_radius_km).toLocaleString()} km
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {previewRestaurants.length > 0 ? (
        <div className="px-0 pt-6 pb-8 space-y-8 border-t border-border/60">
          {previewRestaurants.map((r, i) => (
            <RestaurantMenuSection
              key={r.id}
              restaurant={r}
              payload={homeQueries[i]?.data as HomePayload | undefined}
              isLoading={homeQueries[i]?.isPending ?? false}
              error={homeQueries[i]?.error}
              cartLines={cartLines}
              addToCart={addToCart}
              updateCartQuantity={updateCartQuantity}
              onOpenRestaurant={() => openRestaurant(r)}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

function FeaturedComboCard({
  restaurantId,
  restaurantName,
  combo,
  cartLines,
  addToCart,
  updateCartQuantity,
}: {
  restaurantId: number;
  restaurantName: string;
  combo: HomePayload["combo_sets"][number];
  cartLines: CustomerCartLine[];
  addToCart: (line: CustomerCartLine) => void;
  updateCartQuantity: (
    restaurantId: number,
    matcher: (line: CustomerCartLine) => boolean,
    buildLine: () => CustomerCartLine,
    delta: number,
  ) => void;
}) {
  const restaurantCart = useMemo(() => cartLines.filter((line) => line.restaurantId === restaurantId), [cartLines, restaurantId]);
  const comboQty = restaurantCart.find((line) => line.kind === "combo" && line.comboSetId === combo.id)?.quantity ?? 0;

  return (
    <div className="min-w-[min(85vw,17rem)] snap-start bg-card rounded-xl border border-border overflow-hidden shrink-0 shadow-sm">
      <div className="bg-primary-50">
        <MenuMediaThumb
          mediaPath={combo.image}
          alt={combo.name}
          className="h-24 w-full"
          fallback={<span className="text-2xl">🍱</span>}
        />
      </div>
      <div className="p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted leading-tight mb-1 line-clamp-1">{restaurantName}</p>
        <p className="text-sm font-semibold text-foreground leading-snug">{combo.name}</p>
        <p className="text-xs text-text-muted mt-1 line-clamp-2">{combo.description}</p>
        <div className="flex items-center justify-between mt-2 gap-2">
          <span className="text-md font-bold text-primary shrink-0">₹{Number(combo.price).toLocaleString()}</span>
          {comboQty <= 0 ? (
            <button
              type="button"
              onClick={() =>
                addToCart({
                  kind: "combo",
                  restaurantId,
                  comboSetId: combo.id,
                  name: combo.name,
                  unitPrice: Number(combo.price),
                  quantity: 1,
                  imageUrl: resolveMediaUrl(combo.image),
                })
              }
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shrink-0"
            >
              Add
            </button>
          ) : (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() =>
                  updateCartQuantity(
                    restaurantId,
                    (line) => line.kind === "combo" && line.comboSetId === combo.id,
                    () => ({
                      kind: "combo",
                      restaurantId,
                      comboSetId: combo.id,
                      name: combo.name,
                      unitPrice: Number(combo.price),
                      quantity: 1,
                      imageUrl: resolveMediaUrl(combo.image),
                    }),
                    -1,
                  )
                }
                className="w-7 h-7 rounded-lg bg-surface-alt flex items-center justify-center"
              >
                <Minus size={12} />
              </button>
              <span className="text-sm font-semibold w-5 text-center">{comboQty}</span>
              <button
                type="button"
                onClick={() =>
                  updateCartQuantity(
                    restaurantId,
                    (line) => line.kind === "combo" && line.comboSetId === combo.id,
                    () => ({
                      kind: "combo",
                      restaurantId,
                      comboSetId: combo.id,
                      name: combo.name,
                      unitPrice: Number(combo.price),
                      quantity: 1,
                      imageUrl: resolveMediaUrl(combo.image),
                    }),
                    1,
                  )
                }
                className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center"
              >
                <Plus size={12} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RestaurantMenuSection({
  restaurant,
  payload,
  isLoading,
  error,
  cartLines,
  addToCart,
  updateCartQuantity,
  onOpenRestaurant,
}: {
  restaurant: RestaurantRow;
  payload: HomePayload | undefined;
  isLoading: boolean;
  error: unknown;
  cartLines: CustomerCartLine[];
  addToCart: (line: CustomerCartLine) => void;
  updateCartQuantity: (
    restaurantId: number,
    matcher: (line: CustomerCartLine) => boolean,
    buildLine: () => CustomerCartLine,
    delta: number,
  ) => void;
  onOpenRestaurant: () => void;
}) {
  const restaurantId = restaurant.id;
  const restaurantCart = useMemo(() => cartLines.filter((line) => line.restaurantId === restaurantId), [cartLines, restaurantId]);

  const products = payload?.products ?? [];
  const productItems = payload?.product_items ?? [];
  const combos = payload?.combo_sets ?? [];

  const restaurantProducts = products.filter((p) => p.is_active);
  const errMsg = error instanceof Error ? error.message : error ? String(error) : null;

  return (
    <section className="px-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <button type="button" onClick={onOpenRestaurant} className="text-left min-w-0 group">
          <h3 className="font-display font-semibold text-lg text-foreground group-hover:text-primary transition-colors">{restaurant.name}</h3>
          <p className="text-xs text-text-muted mt-0.5">Tap for full menu · add items from the strip</p>
        </button>
        {isLoading ? <Loader2 size={20} className="text-primary animate-spin shrink-0 mt-1" aria-label="Loading menu" /> : null}
      </div>
      {errMsg ? <p className="text-sm text-error mb-2">{errMsg}</p> : null}

      {!isLoading && !errMsg && restaurantProducts.length === 0 && combos.length === 0 ? (
        <p className="text-sm text-text-muted">No menu items yet.</p>
      ) : (
        <div className="-mx-4 px-4 flex gap-3 overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory">
          {combos.map((combo) => (
            <HorizontalComboCard
              key={`c-${combo.id}`}
              restaurantId={restaurantId}
              combo={combo}
              restaurantCart={restaurantCart}
              addToCart={addToCart}
              updateCartQuantity={updateCartQuantity}
            />
          ))}
          {restaurantProducts.map((product) => (
            <HorizontalProductCard
              key={`p-${product.id}`}
              restaurantId={restaurantId}
              product={product}
              productItems={productItems}
              restaurantCart={restaurantCart}
              addToCart={addToCart}
              updateCartQuantity={updateCartQuantity}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function HorizontalComboCard({
  restaurantId,
  combo,
  restaurantCart,
  addToCart,
  updateCartQuantity,
}: {
  restaurantId: number;
  combo: HomePayload["combo_sets"][number];
  restaurantCart: CustomerCartLine[];
  addToCart: (line: CustomerCartLine) => void;
  updateCartQuantity: (
    restaurantId: number,
    matcher: (line: CustomerCartLine) => boolean,
    buildLine: () => CustomerCartLine,
    delta: number,
  ) => void;
}) {
  const comboQty = restaurantCart.find((line) => line.kind === "combo" && line.comboSetId === combo.id)?.quantity ?? 0;

  return (
    <div className="min-w-[min(72vw,11.5rem)] snap-start bg-card rounded-xl border border-border overflow-hidden shrink-0">
      <div className="bg-primary-50">
        <MenuMediaThumb
          mediaPath={combo.image}
          alt={combo.name}
          className="h-20 w-full"
          fallback={<span className="text-xl">🍱</span>}
        />
      </div>
      <div className="p-2.5">
        <p className="text-[10px] font-semibold text-primary/90 uppercase tracking-wide">Combo</p>
        <p className="text-xs font-semibold text-foreground line-clamp-2 mt-0.5">{combo.name}</p>
        <div className="flex items-center justify-between mt-2 gap-1">
          <span className="text-xs font-bold text-primary">₹{Number(combo.price).toLocaleString()}</span>
          {comboQty <= 0 ? (
            <button
              type="button"
              onClick={() =>
                addToCart({
                  kind: "combo",
                  restaurantId,
                  comboSetId: combo.id,
                  name: combo.name,
                  unitPrice: Number(combo.price),
                  quantity: 1,
                  imageUrl: resolveMediaUrl(combo.image),
                })
              }
              className="p-1.5 rounded-lg bg-primary text-primary-foreground"
            >
              <ShoppingCart size={12} />
            </button>
          ) : (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() =>
                  updateCartQuantity(
                    restaurantId,
                    (line) => line.kind === "combo" && line.comboSetId === combo.id,
                    () => ({
                      kind: "combo",
                      restaurantId,
                      comboSetId: combo.id,
                      name: combo.name,
                      unitPrice: Number(combo.price),
                      quantity: 1,
                      imageUrl: resolveMediaUrl(combo.image),
                    }),
                    -1,
                  )
                }
                className="w-6 h-6 rounded-md bg-surface-alt flex items-center justify-center"
              >
                <Minus size={11} />
              </button>
              <span className="text-xs font-semibold w-4 text-center">{comboQty}</span>
              <button
                type="button"
                onClick={() =>
                  updateCartQuantity(
                    restaurantId,
                    (line) => line.kind === "combo" && line.comboSetId === combo.id,
                    () => ({
                      kind: "combo",
                      restaurantId,
                      comboSetId: combo.id,
                      name: combo.name,
                      unitPrice: Number(combo.price),
                      quantity: 1,
                      imageUrl: resolveMediaUrl(combo.image),
                    }),
                    1,
                  )
                }
                className="w-6 h-6 rounded-md bg-primary text-primary-foreground flex items-center justify-center"
              >
                <Plus size={11} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HorizontalProductCard({
  restaurantId,
  product,
  productItems,
  restaurantCart,
  addToCart,
  updateCartQuantity,
}: {
  restaurantId: number;
  product: HomePayload["products"][number];
  productItems: HomePayload["product_items"];
  restaurantCart: CustomerCartLine[];
  addToCart: (line: CustomerCartLine) => void;
  updateCartQuantity: (
    restaurantId: number,
    matcher: (line: CustomerCartLine) => boolean,
    buildLine: () => CustomerCartLine,
    delta: number,
  ) => void;
}) {
  const items = productItems.filter((pi) => pi.product_id === product.id);
  const defaultItem = items
    .map((i) => {
      const up = typeof i.price === "string" ? Number.parseFloat(i.price) : i.price;
      const disc = typeof i.discount === "string" ? Number.parseFloat(i.discount) : i.discount;
      return {
        ...i,
        final: discountedUnitPrice(up, i.discount_type, disc),
      };
    })
    .sort((a, b) => a.final - b.final)[0];

  const qty =
    defaultItem == null
      ? 0
      : (restaurantCart.find((line) => line.kind === "product" && line.productItemId === defaultItem.id)?.quantity ?? 0);

  const minPrice = items.length
    ? Math.min(
        ...items.map((i) => {
          const up = typeof i.price === "string" ? Number.parseFloat(i.price) : i.price;
          const disc = typeof i.discount === "string" ? Number.parseFloat(i.discount) : i.discount;
          return discountedUnitPrice(up, i.discount_type, disc);
        }),
      )
    : 0;

  return (
    <div className="min-w-[min(72vw,11.5rem)] snap-start bg-card rounded-xl border border-border overflow-hidden shrink-0">
      <div className="relative">
        <MenuMediaThumb mediaPath={product.image} alt={product.name} className="h-20 w-full" />
        <div className="pointer-events-none absolute top-1.5 right-1.5">
          {product.is_veg ? <Leaf size={11} className="text-success drop-shadow-sm" /> : <Circle size={11} className="text-error fill-error drop-shadow-sm" />}
        </div>
      </div>
      <div className="p-2.5">
        <p className="text-xs font-semibold text-foreground line-clamp-2">{product.name}</p>
        <div className="flex items-center justify-between mt-2 gap-1">
          <span className="text-xs font-bold text-primary">₹{minPrice.toLocaleString()}</span>
          {!defaultItem ? null : qty <= 0 ? (
            <button
              type="button"
              onClick={() =>
                addToCart(productLineForCustomerCart(restaurantId, product, defaultItem, resolveMediaUrl(product.image)))
              }
              className="p-1.5 rounded-lg bg-primary text-primary-foreground"
            >
              <ShoppingCart size={12} />
            </button>
          ) : (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() =>
                  updateCartQuantity(
                    restaurantId,
                    (line) => line.kind === "product" && line.productItemId === defaultItem.id,
                    () => productLineForCustomerCart(restaurantId, product, defaultItem, resolveMediaUrl(product.image)),
                    -1,
                  )
                }
                className="w-6 h-6 rounded-md bg-surface-alt flex items-center justify-center"
              >
                <Minus size={11} />
              </button>
              <span className="text-xs font-semibold w-4 text-center">{qty}</span>
              <button
                type="button"
                onClick={() =>
                  updateCartQuantity(
                    restaurantId,
                    (line) => line.kind === "product" && line.productItemId === defaultItem.id,
                    () => productLineForCustomerCart(restaurantId, product, defaultItem, resolveMediaUrl(product.image)),
                    1,
                  )
                }
                className="w-6 h-6 rounded-md bg-primary text-primary-foreground flex items-center justify-center"
              >
                <Plus size={11} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CustomerHome() {
  const navigate = useNavigate({ from: "/customer/" });
  const { restaurantId } = Route.useSearch();
  const { loading, nearbyRestaurant, restaurants, mode } = useLocationCheck();
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<number | null>(restaurantId ?? null);

  useEffect(() => {
    setSelectedRestaurantId(restaurantId ?? null);
  }, [restaurantId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 size={32} className="text-primary animate-spin" />
        <p className="text-sm text-text-muted">Detecting your location…</p>
      </div>
    );
  }

  if (selectedRestaurantId != null) {
    const restaurant = restaurants.find((r) => r.id === selectedRestaurantId);
    return (
      <div>
        <div className="px-4 pt-6 pb-2">
          <button
            type="button"
            onClick={() => {
              setSelectedRestaurantId(null);
              void navigate({
                to: "/customer",
                search: (prev) => ({ ...prev, restaurantId: undefined }),
              });
            }}
            className="text-sm text-primary font-medium mb-2"
          >
            ← Back to restaurants
          </button>
        </div>
        <RestaurantMenu
          restaurantId={selectedRestaurantId}
          title={restaurant?.name ?? `Restaurant ${selectedRestaurantId}`}
          address={restaurant?.address ?? ""}
          isDineIn={false}
        />
      </div>
    );
  }

  if (mode === "dine-in" && nearbyRestaurant) {
    return (
      <RestaurantMenu
        restaurantId={nearbyRestaurant.id}
        title={nearbyRestaurant.name}
        address={nearbyRestaurant.address}
        isDineIn
      />
    );
  }

  const activeRestaurants = restaurants.filter((r) => r.is_open && r.can_delivery);

  return (
    <CustomerDeliveryHome
      activeRestaurants={activeRestaurants}
      navigate={navigate}
      setSelectedRestaurantId={setSelectedRestaurantId}
    />
  );
}

const ADDRESS_EXPAND_THRESHOLD = 140;

function RestaurantMenu({
  restaurantId,
  title,
  address,
  isDineIn,
}: {
  restaurantId: number;
  title: string;
  address: string;
  isDineIn: boolean;
}) {
  const { data, isLoading, error, isError } = useClientHome(restaurantId);
  const payload = data as HomePayload | undefined;

  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [cartLines, setCartLines] = useState<CustomerCartLine[]>([]);
  const [addressExpanded, setAddressExpanded] = useState(false);

  useEffect(() => {
    setCartLines(readCustomerCart());
  }, []);

  const addToCart = (line: CustomerCartLine) => {
    const prev = readCustomerCart();
    const sameRestaurant = prev.filter((x) => x.restaurantId === line.restaurantId);
    const cartBase = sameRestaurant.length > 0 ? sameRestaurant : [];
    const idx = cartBase.findIndex((x) => {
      if (x.kind !== line.kind) return false;
      if (x.kind === "product" && line.kind === "product") return x.productItemId === line.productItemId;
      if (x.kind === "combo" && line.kind === "combo") return x.comboSetId === line.comboSetId;
      return false;
    });
    if (idx >= 0) {
      const next = [...cartBase];
      next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 } as CustomerCartLine;
      writeCustomerCart(next);
      setCartLines(next);
      return;
    }
    const next = [...cartBase, line];
    writeCustomerCart(next);
    setCartLines(next);
  };

  const updateCartQuantity = (
    matcher: (line: CustomerCartLine) => boolean,
    buildLine: () => CustomerCartLine,
    delta: number,
  ) => {
    const current = readCustomerCart().filter((line) => line.restaurantId === restaurantId);
    const index = current.findIndex(matcher);
    if (index === -1 && delta > 0) {
      const next = [...current, buildLine()];
      writeCustomerCart(next);
      setCartLines(next);
      return;
    }
    if (index === -1) return;
    const row = current[index];
    const quantity = row.quantity + delta;
    const next = [...current];
    if (quantity <= 0) {
      next.splice(index, 1);
    } else {
      next[index] = { ...row, quantity };
    }
    writeCustomerCart(next);
    setCartLines(next);
  };

  const categories = payload?.categories ?? [];
  const products = payload?.products ?? [];
  const productItems = payload?.product_items ?? [];
  const combos = payload?.combo_sets ?? [];

  const restaurantCategories = categories.filter((c) => !c.parent_id);
  const restaurantProducts = products.filter((p) => p.is_active);
  const restaurantCart = useMemo(() => cartLines.filter((line) => line.restaurantId === restaurantId), [cartLines, restaurantId]);

  const filteredProducts = restaurantProducts.filter((p) => {
    if (selectedCat && p.category_id !== selectedCat) return false;
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const errMsg = error instanceof Error ? error.message : error ? String(error) : null;
  const trimmedAddress = address.trim();
  const addressNeedsToggle = trimmedAddress.length > ADDRESS_EXPAND_THRESHOLD;
  const menuUnavailable = !isLoading && isError;
  const inactivePortal = Boolean(errMsg?.toLowerCase().includes("inactive"));
  const showMenu = !menuUnavailable && payload;

  return (
    <>
      <div className="bg-primary px-4 pt-10 sm:pt-12 pb-6 rounded-b-3xl shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <MapPin size={14} className="text-primary-foreground/80 shrink-0" aria-hidden />
          <span className="text-xs font-medium tracking-wide text-primary-foreground/85">
            {isDineIn ? "Dine-in · You're at this location" : "Delivery"}
          </span>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6 mb-5">
          <div className="flex items-start gap-3 min-w-0 lg:max-w-[min(100%,28rem)]">
            <div
              className="flex h-[4.25rem] w-11 shrink-0 flex-col items-center justify-center rounded-full border border-primary-foreground/25 bg-black/15 text-primary-foreground shadow-inner"
              aria-hidden
            >
              <span className="font-display text-xl font-bold leading-none">{title.charAt(0).toUpperCase()}</span>
            </div>
            <div className="min-w-0 pt-0.5">
              <h1 className="font-display text-xl font-bold tracking-tight text-primary-foreground sm:text-2xl">{title}</h1>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {isLoading ? null : menuUnavailable ? (
                  <StatusBadge status={inactivePortal ? "inactive" : "failed"} />
                ) : (
                  <StatusBadge status={payload?.restaurant?.is_open ? "open" : "closed"} />
                )}
              </div>
            </div>
          </div>

          <div className="w-full min-w-0 rounded-2xl border border-primary-foreground/20 bg-primary-foreground/[0.12] p-3.5 shadow-sm backdrop-blur-sm lg:max-w-md lg:flex-1 lg:self-stretch">
            <div className="mb-2 flex items-center gap-1.5 text-primary-foreground/75">
              <MapPin size={13} className="shrink-0 opacity-90" aria-hidden />
              <span className="text-[10px] font-semibold uppercase tracking-wider">Restaurant location</span>
            </div>
            <p
              className={`break-words text-sm leading-relaxed text-primary-foreground/95 ${
                addressNeedsToggle && !addressExpanded ? "line-clamp-4" : ""
              }`}
            >
              {trimmedAddress || "—"}
            </p>
            {addressNeedsToggle ? (
              <button
                type="button"
                onClick={() => setAddressExpanded((v) => !v)}
                className="mt-2.5 text-xs font-semibold text-primary-foreground underline decoration-primary-foreground/40 underline-offset-2 hover:decoration-primary-foreground"
              >
                {addressExpanded ? "Show less" : "Show full address"}
              </button>
            ) : null}
          </div>
        </div>

        {showMenu ? (
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 z-[1] -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search menu…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-12 w-full rounded-full border-0 bg-card pl-11 pr-4 text-sm text-foreground shadow-md outline-none ring-0 transition-shadow placeholder:text-muted-foreground focus:shadow-lg focus:ring-2 focus:ring-primary/25"
            />
          </div>
        ) : null}
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin text-primary" />
        </div>
      )}
      {menuUnavailable ? (
        <div className="px-4 py-8">
          <div className="rounded-2xl border border-border bg-card p-5 text-center">
            <p className="text-sm font-semibold text-foreground mb-2">
              {inactivePortal ? "This restaurant is inactive" : "Unable to load this menu"}
            </p>
            <p className="text-xs text-text-muted leading-relaxed">{errMsg}</p>
          </div>
        </div>
      ) : null}

      {showMenu ? (
        <>
      <div className="px-4 py-3 flex gap-2 overflow-x-auto items-center">
        <button
          type="button"
          onClick={() => setSelectedCat(null)}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${!selectedCat ? "bg-primary text-primary-foreground" : "bg-card border border-border text-text-secondary"}`}
        >
          All
        </button>
        {restaurantCategories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setSelectedCat(cat.id)}
            className={`inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-all border ${
              selectedCat === cat.id ? "bg-primary text-primary-foreground border-transparent" : "bg-card border-border text-text-secondary"
            }`}
          >
            <span className="w-8 h-8 rounded-full overflow-hidden shrink-0 ring-1 ring-black/5">
              <MenuMediaThumb
                mediaPath={cat.image}
                alt={cat.name}
                className="h-full w-full min-h-0"
                fallback={<span className="text-sm">📂</span>}
              />
            </span>
            {cat.name}
          </button>
        ))}
      </div>

      {combos.length > 0 && !searchQuery && (
        <div className="px-4 mb-4">
          <h2 className="font-display font-semibold text-md text-foreground mb-3">🔥 Combo Sets</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {combos.map((combo) => (
              <div key={combo.id} className="min-w-[200px] bg-card rounded-xl border border-border overflow-hidden shrink-0">
                <div className="bg-primary-50">
                  <MenuMediaThumb
                    mediaPath={combo.image}
                    alt={combo.name}
                    className="h-24 w-full"
                    fallback={<span className="text-2xl">🍱</span>}
                  />
                </div>
                <div className="p-3">
                  <p className="text-sm font-semibold text-foreground">{combo.name}</p>
                  <p className="text-xs text-text-muted mt-1 line-clamp-2">{combo.description}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-md font-bold text-primary">₹{Number(combo.price).toLocaleString()}</span>
                    {(() => {
                      const comboQty = restaurantCart.find((line) => line.kind === "combo" && line.comboSetId === combo.id)?.quantity ?? 0;
                      if (comboQty <= 0) {
                        return (
                          <button
                            type="button"
                            onClick={() =>
                              addToCart({
                                kind: "combo",
                                restaurantId,
                                comboSetId: combo.id,
                                name: combo.name,
                                unitPrice: Number(combo.price),
                                quantity: 1,
                                imageUrl: resolveMediaUrl(combo.image),
                              })
                            }
                            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
                          >
                            Cart
                          </button>
                        );
                      }
                      return (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              updateCartQuantity(
                                (line) => line.kind === "combo" && line.comboSetId === combo.id,
                                () => ({
                                  kind: "combo",
                                  restaurantId,
                                  comboSetId: combo.id,
                                  name: combo.name,
                                  unitPrice: Number(combo.price),
                                  quantity: 1,
                                  imageUrl: resolveMediaUrl(combo.image),
                                }),
                                -1,
                              )
                            }
                            className="w-7 h-7 rounded-lg bg-surface-alt flex items-center justify-center"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="text-sm font-semibold w-5 text-center">{comboQty}</span>
                          <button
                            type="button"
                            onClick={() =>
                              updateCartQuantity(
                                (line) => line.kind === "combo" && line.comboSetId === combo.id,
                                () => ({
                                  kind: "combo",
                                  restaurantId,
                                  comboSetId: combo.id,
                                  name: combo.name,
                                  unitPrice: Number(combo.price),
                                  quantity: 1,
                                  imageUrl: resolveMediaUrl(combo.image),
                                }),
                                1,
                              )
                            }
                            className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 pb-8">
        <h2 className="font-display font-semibold text-md text-foreground mb-3">Menu</h2>
        <div className="grid grid-cols-2 gap-3">
          {filteredProducts.map((product) => {
            const items = productItems.filter((pi) => pi.product_id === product.id);
            const defaultItem = items
              .map((i) => {
                const up = typeof i.price === "string" ? Number.parseFloat(i.price) : i.price;
                const disc = typeof i.discount === "string" ? Number.parseFloat(i.discount) : i.discount;
                return {
                  ...i,
                  final: discountedUnitPrice(up, i.discount_type, disc),
                };
              })
              .sort((a, b) => a.final - b.final)[0];
            const qty =
              defaultItem == null
                ? 0
                : (restaurantCart.find(
                    (line) => line.kind === "product" && line.productItemId === defaultItem.id,
                  )?.quantity ?? 0);
            const minPrice = items.length
              ? Math.min(
                  ...items.map((i) => {
                    const up = typeof i.price === "string" ? Number.parseFloat(i.price) : i.price;
                    const disc = typeof i.discount === "string" ? Number.parseFloat(i.discount) : i.discount;
                    return discountedUnitPrice(up, i.discount_type, disc);
                  }),
                )
              : 0;
            return (
              <div key={product.id} className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="relative">
                  <MenuMediaThumb mediaPath={product.image} alt={product.name} className="h-24 w-full" />
                  <div className="pointer-events-none absolute top-2 right-2">
                    {product.is_veg ? <Leaf size={12} className="text-success drop-shadow-sm" /> : <Circle size={12} className="text-error fill-error drop-shadow-sm" />}
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-sm font-semibold text-foreground truncate">{product.name}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-bold text-primary">₹{minPrice.toLocaleString()}</span>
                    {qty <= 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (!defaultItem) return;
                          addToCart(productLineForCustomerCart(restaurantId, product, defaultItem, resolveMediaUrl(product.image)));
                        }}
                        className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center"
                      >
                        <ShoppingCart size={12} />
                      </button>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (!defaultItem) return;
                            updateCartQuantity(
                              (line) => line.kind === "product" && line.productItemId === defaultItem.id,
                              () => productLineForCustomerCart(restaurantId, product, defaultItem, resolveMediaUrl(product.image)),
                              -1,
                            );
                          }}
                          className="w-7 h-7 rounded-lg bg-surface-alt flex items-center justify-center"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="text-sm font-semibold w-5 text-center">{qty}</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (!defaultItem) return;
                            updateCartQuantity(
                              (line) => line.kind === "product" && line.productItemId === defaultItem.id,
                              () => productLineForCustomerCart(restaurantId, product, defaultItem, resolveMediaUrl(product.image)),
                              1,
                            );
                          }}
                          className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
        </>
      ) : null}
    </>
  );
}
