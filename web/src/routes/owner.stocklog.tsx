import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { OwnerEntityCard, ownerListActionClass } from "@/components/owner/OwnerEntityCard";
import { ListPageShell, PaginatedList } from "@/components/shared/PaginatedList";
import { useRawMaterials, useStockLogs, useUnits } from "@/hooks/use-rest-api";
import { useAuth } from "@/lib/auth-context";
import { ownerStaffShowsRestaurantColumn, type RestaurantRowExtras } from "@/lib/restaurant-table-column";
import { useRestaurantScope } from "@/lib/restaurant-context";
import { Calendar, ClipboardList, MapPin } from "lucide-react";

export const Route = createFileRoute("/owner/stocklog")({ component: StockLogPage });

type StockLogRow = RestaurantRowExtras & {
  id: number;
  created_at: string;
  raw_material: number;
  type: string;
  quantity: string | number;
  purchase?: number;
  order?: number;
};

function StockLogPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { restaurantId } = useRestaurantScope();
  const showRestaurantCol = ownerStaffShowsRestaurantColumn(user);
  const { data: stockLogs, isPending, isError, error } = useStockLogs(restaurantId);
  const { data: rawMaterials } = useRawMaterials(restaurantId);
  const { data: units } = useUnits(restaurantId);

  const [filter, setFilter] = useState("all");

  const filtered = useMemo(() => {
    const list = (stockLogs as StockLogRow[] | undefined) ?? [];
    return filter === "all" ? list : list.filter((s) => s.type === filter);
  }, [stockLogs, filter]);

  const rmName = (rid: number) =>
    (rawMaterials as { id: number; name: string }[] | undefined)?.find((r) => r.id === rid)?.name ?? "—";

  const qtyLabel = (rid: number, qty: number) => {
    const rm = (rawMaterials as { id: number; unit: number }[] | undefined)?.find((r) => r.id === rid);
    const sym = rm
      ? (units as { id: number; symbol: string }[] | undefined)?.find((u) => u.id === rm.unit)?.symbol ?? ""
      : "";
    return `${qty} ${sym}`.trim();
  };

  return (
    <>
      <ListPageShell
        fillViewport
        header={
          <>
            <h2 className="font-display font-semibold text-lg text-foreground mb-4">Stock Log</h2>
            <div className="flex gap-2 mb-4">
              {["all", "in", "out"].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold capitalize transition-all ${
                    filter === f ? "bg-primary text-primary-foreground" : "bg-surface-alt text-text-secondary hover:bg-primary-50"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            {isError ? (
              <p className="text-sm text-error mb-4" role="alert">
                {error instanceof Error ? error.message : "Could not load stock log."}
              </p>
            ) : null}
          </>
        }
      >
        {isPending ? (
          <div className="bg-card rounded-xl border border-border px-4 py-12 text-center text-text-muted text-sm">Loading…</div>
        ) : (
        <PaginatedList
          items={filtered}
          resetDeps={[filter]}
          empty={<p className="text-sm text-text-muted">No stock movements match this filter.</p>}
          renderItem={(s, sel) => {
            const when = (() => {
              const d = new Date(s.created_at);
              return Number.isNaN(d.getTime()) ? s.created_at : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
            })();
            const source = s.purchase ? "Purchase" : s.order ? "Order" : "Manual";
            return (
              <OwnerEntityCard
                {...(sel.selectable ? sel : {})}
                onClick={() => {
                  void navigate({ to: "/owner/stocklog/$id", params: { id: String(s.id) } });
                }}
                leading={
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <ClipboardList strokeWidth={2} aria-hidden />
                  </div>
                }
                title={rmName(s.raw_material)}
                subtitle={
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar size={14} className="shrink-0 text-primary" aria-hidden />
                    <span>{when}</span>
                  </span>
                }
                meta={
                  <>
                    {showRestaurantCol && s.restaurant_name ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
                        <MapPin size={12} className="shrink-0 text-primary" aria-hidden />
                        {s.restaurant_name}
                      </span>
                    ) : null}
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        s.type === "in" ? "bg-success/10 text-success" : "bg-error/10 text-error"
                      }`}
                    >
                      {s.type.toUpperCase()}
                    </span>
                    <span className="font-mono text-sm font-semibold text-foreground">{qtyLabel(s.raw_material, Number(s.quantity))}</span>
                    <span className="text-xs text-text-muted">{source}</span>
                  </>
                }
                actions={
                  <Link
                    to="/owner/stocklog/$id"
                    params={{ id: String(s.id) }}
                    onClick={(e) => e.stopPropagation()}
                    className={ownerListActionClass}
                  >
                    View entry
                  </Link>
                }
              />
            );
          }}
        />
        )}
      </ListPageShell>
    </>
  );
}
