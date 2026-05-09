import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { useAuth } from "@/lib/auth-context";
import { useLedgersAcrossRestaurantIds, useRestaurants } from "@/hooks/use-rest-api";
import { money } from "@/lib/money";
import { PartyLedgerDetailView } from "@/components/ledger/PartyLedgerDetailView";
import type { LedgerListRow } from "@/components/ledger/ledger-types";

type Mode = "staff" | "customer";

function balanceForRows(rows: LedgerListRow[]): number {
  let c = 0;
  let d = 0;
  for (const r of rows) {
    const n = Number(r.amount);
    if (r.type === "credit") c += n;
    else d += n;
  }
  return c - d;
}

export function PersonalLedgerRestaurantPicker({
  mode,
  showPageTitle = true,
}: {
  mode: Mode;
  /** When false, omit the main Ledger heading (e.g. when embedded under another page title). */
  showPageTitle?: boolean;
}) {
  const { user } = useAuth();
  const partyId = user != null ? String(user.id) : null;
  const partyType = mode === "customer" ? "customer" : "staff";
  const restaurantIds = useMemo(() => {
    if (mode === "customer") return [...new Set(user?.restaurant_ids ?? [])];
    return [...new Set((user?.staff_memberships ?? []).filter((m) => !m.is_suspend).map((m) => m.restaurant))];
  }, [user, mode]);

  const queries = useLedgersAcrossRestaurantIds(restaurantIds, partyType, partyId);
  const { data: restaurants = [] } = useRestaurants();

  const sections = restaurantIds.map((rid, i) => ({
    rid,
    rows: (queries[i]?.data as LedgerListRow[] | undefined) ?? [],
    pending: queries[i]?.isPending ?? false,
  }));

  const withLedger = sections.filter((s) => s.rows.length > 0);
  const loading = sections.some((s) => s.pending);

  const labelForRestaurant = (rid: number) =>
    (restaurants as { id: number; name: string }[]).find((r) => r.id === rid)?.name ?? `Restaurant #${rid}`;

  const partyLabel = user?.name || (mode === "customer" ? "Your ledger" : "Your ledger");

  if (!partyId) return <p className="text-sm text-text-muted">Sign in to view your ledger.</p>;
  if (!restaurantIds.length) return <p className="text-sm text-text-muted">No restaurants linked to your account.</p>;
  if (loading) return <p className="text-sm text-text-muted">Loading…</p>;

  if (withLedger.length >= 2) {
    const linkTo = mode === "customer" ? "/customer/ledger/$restaurantId" : "/staff/ledger/$restaurantId";
    const rowsForTable = withLedger.map((s) => ({ id: s.rid, ...s }));
    return (
      <>
        {showPageTitle ? (
          <>
            <h2 className="mb-4 font-display text-lg font-semibold text-foreground">Ledger</h2>
            <p className="mb-4 text-xs text-text-muted">
              You have ledger activity at more than one restaurant. Pick one to view entries.
            </p>
          </>
        ) : null}
        <DataTable
          columns={[
            {
              header: "Restaurant",
              accessor: (x) => labelForRestaurant((x as { rid: number }).rid),
            },
            {
              header: "Entries",
              accessor: (x) => String((x as { rows: LedgerListRow[] }).rows.length),
            },
            {
              header: "Balance",
              accessor: (x) => (
                <span className="font-mono">{money(balanceForRows((x as { rows: LedgerListRow[] }).rows))}</span>
              ),
            },
            {
              header: "Actions",
              accessor: (x) => {
                const row = x as { rid: number };
                return (
                  <Link to={linkTo} params={{ restaurantId: String(row.rid) }} className="text-xs font-medium text-primary">
                    View
                  </Link>
                );
              },
            },
          ]}
          data={rowsForTable}
        />
      </>
    );
  }

  const ridSingle = withLedger.length === 1 ? withLedger[0]!.rid : restaurantIds[0]!;

  return (
    <PartyLedgerDetailView
      restaurantId={ridSingle}
      partyType={partyType}
      partyId={partyId}
      partyLabel={partyLabel}
      backHref={mode === "customer" ? "/customer/ledger" : "/staff"}
      canMutate={false}
    />
  );
}
