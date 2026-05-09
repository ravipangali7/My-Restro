import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import { clearCustomerCart, readCustomerCart, writeCustomerCart, type CustomerCartLine } from "@/lib/customer-cart";
import { apiGet, apiPost } from "@/lib/api";
import { MenuMediaThumb } from "@/components/shared/MenuMediaThumb";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { pushOwnerNotification } from "@/lib/owner-notifications";
import { useClientHome } from "@/hooks/use-rest-api";
import { LocationMapPicker } from "@/components/shared/LocationMapPicker";
import { haversineDistanceKm } from "@/lib/geo";

export const Route = createFileRoute("/customer/cart")({
  component: CustomerCart,
});

function CustomerCart() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const [cart, setCart] = useState<CustomerCartLine[]>([]);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [orderType, setOrderType] = useState<"table" | "packing" | "delivery">("table");
  const [selectedTable, setSelectedTable] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryLatitude, setDeliveryLatitude] = useState("");
  const [deliveryLongitude, setDeliveryLongitude] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "online">("online");

  const restaurantId = cart[0]?.restaurantId ?? null;
  const { data: restaurantRows = [], isPending: restaurantsLoading } = useQuery({
    queryKey: ["restaurants", "browse"],
    queryFn: () =>
      apiGet<
        Array<{
          id: number;
          name?: string;
          can_delivery?: boolean;
          delivery_fee_per_km?: string | number;
          delivery_radius_km?: string | number;
          latitude?: string | number | null;
          longitude?: string | number | null;
        }>
      >("/api/restaurants/"),
    staleTime: 60_000,
    enabled: cart.length > 0 && restaurantId != null,
  });
  const cartRestaurant = useMemo(
    () => restaurantRows.find((r) => r.id === restaurantId) ?? null,
    [restaurantRows, restaurantId],
  );
  const { data: clientHome } = useClientHome(restaurantId);
  const tables = useMemo(() => {
    const rows =
      (clientHome as { tables?: Array<{ id?: number; name?: string; image?: string | null }> } | undefined)?.tables ??
      [];
    return rows
      .filter((row) => row.id != null)
      .map((row) => ({
        id: row.id as number,
        name: row.name?.trim() ? row.name : `Table #${row.id}`,
        image: row.image ?? null,
      }));
  }, [clientHome]);

  const selectedTableRow = useMemo(() => {
    if (!selectedTable) return null;
    return tables.find((t) => String(t.id) === selectedTable) ?? null;
  }, [tables, selectedTable]);

  useEffect(() => {
    setCart(readCustomerCart());
  }, []);

  useEffect(() => {
    if (!user) return;
    setCustomerName((prev) => (prev.trim() ? prev : user.name ?? ""));
    setCustomerPhone((prev) => (prev.trim() ? prev : user.phone ?? ""));
  }, [user]);

  const updateQty = (index: number, delta: number) => {
    setCart((prev) => {
      const next = [...prev];
      const row = next[index];
      if (!row) return prev;
      const quantity = Math.max(1, row.quantity + delta);
      next[index] = { ...row, quantity };
      writeCustomerCart(next);
      return next;
    });
  };

  const removeLine = (index: number) => {
    setCart((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) {
        clearCustomerCart();
      } else {
        writeCustomerCart(next);
      }
      return next;
    });
  };

  const subTotal = useMemo(() => cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0), [cart]);

  const menuOfferSavings = useMemo(
    () =>
      cart.reduce((sum, line) => {
        if (line.kind !== "product" || line.listUnitPrice == null) return sum;
        const perUnit = Math.max(0, line.listUnitPrice - line.unitPrice);
        return sum + perUnit * line.quantity;
      }, 0),
    [cart],
  );

  const deliveryFeePreview = useMemo(() => {
    if (orderType !== "delivery" || !cartRestaurant?.can_delivery) return 0;
    const rate = Number(cartRestaurant.delivery_fee_per_km ?? 0);
    const rLat = cartRestaurant.latitude != null ? Number(cartRestaurant.latitude) : NaN;
    const rLng = cartRestaurant.longitude != null ? Number(cartRestaurant.longitude) : NaN;
    const dLat = Number.parseFloat(deliveryLatitude);
    const dLng = Number.parseFloat(deliveryLongitude);
    if (!Number.isFinite(rate) || rate <= 0) return 0;
    if (!Number.isFinite(rLat) || !Number.isFinite(rLng) || !Number.isFinite(dLat) || !Number.isFinite(dLng)) return 0;
    const km = haversineDistanceKm(rLat, rLng, dLat, dLng);
    return Math.round(km * rate * 100) / 100;
  }, [orderType, cartRestaurant, deliveryLatitude, deliveryLongitude]);

  const deliveryDistanceKm = useMemo(() => {
    if (orderType !== "delivery") return null;
    const rLat = cartRestaurant?.latitude != null ? Number(cartRestaurant.latitude) : NaN;
    const rLng = cartRestaurant?.longitude != null ? Number(cartRestaurant.longitude) : NaN;
    const dLat = Number.parseFloat(deliveryLatitude);
    const dLng = Number.parseFloat(deliveryLongitude);
    if (!Number.isFinite(rLat) || !Number.isFinite(rLng) || !Number.isFinite(dLat) || !Number.isFinite(dLng)) {
      return null;
    }
    return haversineDistanceKm(rLat, rLng, dLat, dLng);
  }, [orderType, cartRestaurant, deliveryLatitude, deliveryLongitude]);

  const grandTotal = orderType === "delivery" ? subTotal + deliveryFeePreview : subTotal;

  const placeOrder = async () => {
    if (!token) {
      setError("Please login to place your order.");
      return;
    }
    if (cart.length === 0) {
      setError("Your cart is empty.");
      return;
    }
    const restaurantId = cart[0]?.restaurantId;
    if (!restaurantId) {
      setError("Invalid cart restaurant.");
      return;
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      setError("Please fill customer details before placing order.");
      return;
    }
    if (orderType === "table" && !selectedTable) {
      setError("Please select a table for dine-in order.");
      return;
    }
    if (orderType === "delivery") {
      if (restaurantsLoading) {
        setError("Loading restaurant information…");
        return;
      }
      if (!cartRestaurant?.can_delivery) {
        setError("This restaurant does not offer delivery.");
        return;
      }
      const dLat = Number.parseFloat(deliveryLatitude);
      const dLng = Number.parseFloat(deliveryLongitude);
      if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) {
        setError("Tap the map or drag the pin to set your delivery location.");
        return;
      }
      const rate = Number(cartRestaurant.delivery_fee_per_km ?? 0);
      if (rate > 0) {
        const rLat = cartRestaurant.latitude != null ? Number(cartRestaurant.latitude) : NaN;
        const rLng = cartRestaurant.longitude != null ? Number(cartRestaurant.longitude) : NaN;
        if (!Number.isFinite(rLat) || !Number.isFinite(rLng)) {
          setError("This restaurant has not set its location yet; delivery cannot be priced.");
          return;
        }
      }
      const radiusKm = Number(cartRestaurant.delivery_radius_km ?? 0);
      if (Number.isFinite(radiusKm) && radiusKm > 0 && Number.isFinite(deliveryDistanceKm) && deliveryDistanceKm >= radiusKm) {
        setError("You are out of reach of the restaurant delivery radius.");
        return;
      }
    }
    setError(null);
    setPlacing(true);
    try {
      const createdOrder = await apiPost<{ id?: number; order_id?: string }>(
        "/api/orders/",
        {
          restaurant: restaurantId,
          customer: user?.id ?? null,
          table: orderType === "delivery" ? null : selectedTable ? Number(selectedTable) : null,
          order_type: orderType,
          address: orderType === "delivery" ? deliveryAddress.trim() : "",
          latitude: orderType === "delivery" ? Number.parseFloat(deliveryLatitude) : null,
          longitude: orderType === "delivery" ? Number.parseFloat(deliveryLongitude) : null,
          payment_method: paymentMethod === "online" ? "e_wallet" : "cash",
          guest_customer_name: customerName.trim(),
          guest_customer_phone: customerPhone.trim(),
          lines: cart.map((line) =>
            line.kind === "product"
              ? { product_item_id: line.productItemId, quantity: String(line.quantity) }
              : { comboset_id: line.comboSetId, quantity: String(line.quantity) },
          ),
        },
        token,
      );
      pushOwnerNotification({
        restaurantId,
        title: "New order placed",
        message: `New order ${createdOrder.order_id ?? ""} received from ${customerName.trim()}.`,
        to: createdOrder.id != null ? `/owner/orders/${createdOrder.id}` : "/owner/orders",
      });
      clearCustomerCart();
      setCart([]);
      setSelectedTable("");
      setDeliveryAddress("");
      setDeliveryLatitude("");
      setDeliveryLongitude("");
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not place order.");
    } finally {
      setPlacing(false);
    }
  };

  return (
    <>
      <div className="px-4 pt-6 pb-4">
        <h1 className="font-display font-bold text-xl text-foreground">Cart</h1>
      </div>
      {cart.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 px-4">
          <div className="w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center">
            <ShoppingCart size={28} className="text-primary" />
          </div>
          <p className="text-sm text-text-muted text-center">Your cart is empty</p>
          <p className="text-xs text-text-muted text-center">Add items from a restaurant menu to get started</p>
        </div>
      ) : (
        <div className="px-4 pb-6">
          <div className="bg-card rounded-xl border border-border divide-y divide-border">
            {cart.map((line, idx) => (
              <div key={`${line.kind}-${idx}`} className="p-3 flex items-center gap-3">
                <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 border border-border bg-surface-alt">
                  <MenuMediaThumb
                    mediaPath={line.imageUrl ?? null}
                    alt={line.name}
                    className="h-full w-full min-h-0"
                    fallback={line.kind === "combo" ? <span className="text-xl">🍱</span> : undefined}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{line.name}</p>
                  <p className="text-xs text-text-muted">
                    {line.kind === "product" ? line.unitLabel : "Combo Set"} —{" "}
                    {line.kind === "product" && line.listUnitPrice != null && line.listUnitPrice > line.unitPrice ? (
                      <>
                        <span className="line-through opacity-80">₹{line.listUnitPrice.toLocaleString()}</span>{" "}
                        <span className="text-primary font-semibold">₹{line.unitPrice.toLocaleString()}</span>
                        <span className="text-success font-medium">
                          {" "}
                          (save ₹{Math.round((line.listUnitPrice - line.unitPrice) * line.quantity).toLocaleString()})
                        </span>
                      </>
                    ) : (
                      <>₹{line.unitPrice.toLocaleString()}</>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => updateQty(idx, -1)} className="w-7 h-7 rounded-lg bg-surface-alt flex items-center justify-center">
                    <Minus size={12} />
                  </button>
                  <span className="text-sm font-semibold w-5 text-center">{line.quantity}</span>
                  <button type="button" onClick={() => updateQty(idx, 1)} className="w-7 h-7 rounded-lg bg-surface-alt flex items-center justify-center">
                    <Plus size={12} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(idx)}
                  className="text-xs text-error font-semibold hover:underline"
                >
                  Remove
                </button>
                <p className="text-sm font-bold font-mono w-16 text-right">₹{(line.unitPrice * line.quantity).toLocaleString()}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 bg-card rounded-xl border border-border p-4 space-y-3">
            <h2 className="font-display font-semibold text-md text-foreground">Order Details</h2>
            {error && <p className="text-xs text-error">{error}</p>}
            <div>
              <label className="text-xs text-text-muted mb-1 block">Name *</label>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter your name"
                className="w-full h-10 rounded-lg border border-border px-3 text-sm bg-card"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">Phone *</label>
              <input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="98XXXXXXXX"
                className="w-full h-10 rounded-lg border border-border px-3 text-sm bg-card"
              />
            </div>

            <div>
              <p className="text-xs text-text-muted mb-1 block">Order Type</p>
              <div className="flex gap-2">
                {(["table", "packing", "delivery"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    disabled={type === "delivery" && !cartRestaurant?.can_delivery}
                    title={
                      type === "delivery" && !cartRestaurant?.can_delivery
                        ? "Delivery is not enabled for this restaurant"
                        : undefined
                    }
                    onClick={() => {
                      setOrderType(type);
                      setError(null);
                    }}
                    className={`h-9 px-3 rounded-lg border text-sm capitalize ${
                      orderType === type ? "border-primary bg-primary-50 text-primary font-semibold" : "border-border"
                    } ${type === "delivery" && !cartRestaurant?.can_delivery ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {(orderType === "table" || orderType === "packing") && (
              <div>
                <label className="text-xs text-text-muted mb-1 block">
                  {orderType === "table" ? "Table Number *" : "Table (optional)"}
                </label>
                <select
                  value={selectedTable}
                  onChange={(e) => setSelectedTable(e.target.value)}
                  className="w-full h-10 rounded-lg border border-border px-3 text-sm bg-card"
                >
                  <option value="">{orderType === "table" ? "Select a table" : "No table / counter pickup"}</option>
                  {tables.map((table) => (
                    <option key={table.id} value={table.id}>
                      {table.name}
                    </option>
                  ))}
                </select>
                {selectedTableRow != null ? (
                  <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-surface-alt/40 p-2">
                    <MenuMediaThumb
                      mediaPath={selectedTableRow.image}
                      alt={selectedTableRow.name}
                      className="h-14 w-14 shrink-0 rounded-lg border border-border"
                    />
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Selected table</p>
                      <p className="truncate text-sm font-medium text-foreground">{selectedTableRow.name}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {orderType === "delivery" && (
              <div className="space-y-2">
                <label className="text-xs text-text-muted mb-1 block">Delivery pin (map)</label>
                <LocationMapPicker
                  latitude={deliveryLatitude}
                  longitude={deliveryLongitude}
                  defaultLatitude={cartRestaurant?.latitude ?? null}
                  defaultLongitude={cartRestaurant?.longitude ?? null}
                  placeSearch={{
                    countryCodes: "np",
                    placeholder: "Search street, place, or ward in Nepal…",
                  }}
                  onPlaceSelected={(displayName) => setDeliveryAddress(displayName)}
                  onCoordinatesChange={(lat, lng) => {
                    setDeliveryLatitude(lat);
                    setDeliveryLongitude(lng);
                  }}
                />
                <div>
                  <label className="text-xs text-text-muted mb-1 block">Address / landmarks (optional)</label>
                  <textarea
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Flat, street, gate code, etc."
                    rows={2}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-card resize-y min-h-[2.5rem]"
                  />
                </div>
                {cartRestaurant?.can_delivery ? (
                  <div className="rounded-lg border border-border bg-surface-alt/40 px-3 py-2.5 space-y-2">
                    {Number(cartRestaurant.delivery_fee_per_km ?? 0) > 0 ? (
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                        <span className="text-xs text-text-secondary shrink-0">
                          Rate: ₹{Number(cartRestaurant.delivery_fee_per_km).toLocaleString()} / km
                        </span>
                        {deliveryFeePreview > 0 ? (
                          <span className="text-sm font-semibold text-foreground tabular-nums">
                            Delivery: ₹{deliveryFeePreview.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted">Set a pin on the map to estimate the charge.</span>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-text-muted">No per-km delivery fee is set for this restaurant.</p>
                    )}
                    <p className="text-xs text-text-muted border-t border-border/60 pt-2 leading-relaxed">
                      <span className="block sm:inline">
                        Delivery radius: {Number(cartRestaurant.delivery_radius_km ?? 0).toLocaleString()} km
                      </span>
                      {Number.isFinite(deliveryDistanceKm) ? (
                        <span className="block sm:inline sm:before:content-['·'] sm:before:mx-1">
                          Your distance: {Number(deliveryDistanceKm).toFixed(2)} km
                        </span>
                      ) : (
                        <span className="block sm:inline sm:before:content-['·'] sm:before:mx-1">
                          Distance updates when you set a pin.
                        </span>
                      )}
                    </p>
                  </div>
                ) : null}
              </div>
            )}

            <div>
              <p className="text-xs text-text-muted mb-1 block">Payment Method</p>
              <div className="flex gap-2">
                {(["cash", "online"] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`h-9 px-3 rounded-lg border text-sm capitalize ${
                      paymentMethod === method ? "border-primary bg-primary-50 text-primary font-semibold" : "border-border"
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 bg-card rounded-xl border border-border p-4 space-y-3">
            {menuOfferSavings > 0 ? (
              <div className="flex justify-between text-sm rounded-lg border border-success/30 bg-success/5 px-3 py-2">
                <span className="text-success font-medium">Menu offer savings</span>
                <span className="font-mono text-success font-semibold">−₹{Math.round(menuOfferSavings).toLocaleString()}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Sub Total</span>
              <span className="font-mono">₹{subTotal.toLocaleString()}</span>
            </div>
            {orderType === "delivery" && deliveryFeePreview > 0 ? (
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Delivery</span>
                <span className="font-mono">₹{deliveryFeePreview.toLocaleString()}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-md font-bold border-t border-border pt-2">
              <span>Total</span>
              <span className="font-mono">₹{grandTotal.toLocaleString()}</span>
            </div>
            <button
              type="button"
              disabled={placing}
              onClick={() => void placeOrder()}
              className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50"
            >
              {placing ? "Placing..." : paymentMethod === "online" ? "Place Order & Pay" : "Place Order"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
