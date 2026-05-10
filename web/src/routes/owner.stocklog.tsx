import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { useRawMaterials, useStockLogs, useUnits } from "@/hooks/use-rest-api";
import { useAuth } from "@/lib/auth-context";
import { ownerStaffShowsRestaurantColumn, restaurantTableColumn, type RestaurantRowExtras } from "@/lib/restaurant-table-column";
import { useRestaurantScope } from "@/lib/restaurant-context";

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
      {isError && (
        <p className="text-sm text-error mb-4" role="alert">
          {error instanceof Error ? error.message : "Could not load stock log."}
        </p>
      )}
      {isPending ? (
        <div className="bg-card rounded-xl border border-border px-4 py-12 text-center text-text-muted text-sm">Loading…</div>
      ) : (
      <DataTable
        columns={[
          { header: "Date", accessor: "created_at" },
          ...(showRestaurantCol ? [restaurantTableColumn<StockLogRow>()] : []),
          { header: "Raw Material", accessor: (s) => rmName(s.raw_material) },
          {
            header: "Type",
            accessor: (s) => (
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  s.type === "in" ? "bg-success/10 text-success" : "bg-error/10 text-error"
                }`}
              >
                {s.type.toUpperCase()}
              </span>
            ),
          },
          {
            header: "Quantity",
            accessor: (s) => qtyLabel(s.raw_material, Number(s.quantity)),
          },
          {
            header: "Source",
            accessor: (s) => (s.purchase ? "Purchase" : s.order ? "Order" : "Manual"),
          },
        ]}
        data={filtered}
        onRowClick={(s) => {
          void navigate({ to: "/owner/stocklog/$id", params: { id: String(s.id) } });
        }}
      />
      )}
    </>
  );
}
