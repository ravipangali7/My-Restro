import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { OwnerEntityCard, ownerListActionClass } from "@/components/owner/OwnerEntityCard";
import { ListPageShell, PaginatedList } from "@/components/shared/PaginatedList";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCustomers, useLedgers, useStaffMembers, useSuppliers } from "@/hooks/use-rest-api";
import { money } from "@/lib/money";
import { BookOpen, Truck, UserRound, Users } from "lucide-react";
import type { LedgerListRow, LedgerPartyKind, LedgerPartyRow } from "@/components/ledger/ledger-types";

type PartyTab = "all" | LedgerPartyKind;

interface StaffRow {
  id: number;
  user: number;
  restaurant?: number;
  user_name?: string;
  user_phone?: string;
}

interface CustomerRow {
  id: number;
  name?: string;
  phone?: string;
}

interface SupplierRow {
  id: number;
  name: string;
}

function aggregateByParty(rows: LedgerListRow[]): Map<string, { credit: number; debit: number }> {
  const m = new Map<string, { credit: number; debit: number }>();
  for (const r of rows) {
    const k = `${r.party_type}:${r.party_id}`;
    const cur = m.get(k) ?? { credit: 0, debit: 0 };
    const n = Number(r.amount);
    if (r.type === "credit") cur.credit += n;
    else cur.debit += n;
    m.set(k, cur);
  }
  return m;
}

function partyLeadingIcon(partyType: LedgerPartyKind): ReactNode {
  const wrap = (node: ReactNode) => (
    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">{node}</div>
  );
  if (partyType === "customer") return wrap(<UserRound strokeWidth={2} aria-hidden />);
  if (partyType === "staff") return wrap(<Users strokeWidth={2} aria-hidden />);
  return wrap(<Truck strokeWidth={2} aria-hidden />);
}

export function LedgerPartiesHub({
  restaurantId,
  portal,
}: {
  restaurantId: number;
  portal: "owner" | "staff" | "customer";
}) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<PartyTab>("all");
  const { data: ledgerRaw = [], isLoading, error } = useLedgers(restaurantId);
  const { data: customers = [] } = useCustomers(restaurantId);
  const { data: suppliers = [] } = useSuppliers(restaurantId);
  const { data: staff = [] } = useStaffMembers(restaurantId);

  const ledgerRows = ledgerRaw as LedgerListRow[];
  const totals = useMemo(() => aggregateByParty(ledgerRows), [ledgerRows]);

  const parties = useMemo(() => {
    const out: LedgerPartyRow[] = [];
    const seen = new Set<string>();

    const pushParty = (partyType: LedgerPartyKind, partyId: string, name: string) => {
      const k = `${partyType}:${partyId}`;
      if (seen.has(k)) return;
      seen.add(k);
      const t = totals.get(k) ?? { credit: 0, debit: 0 };
      out.push({
        id: k,
        partyType,
        partyId,
        name,
        totalCredit: t.credit,
        totalDebit: t.debit,
        balance: t.credit - t.debit,
      });
    };

    for (const c of customers as CustomerRow[]) {
      pushParty("customer", String(c.id), c.name || c.phone || `Customer #${c.id}`);
    }
    for (const s of suppliers as SupplierRow[]) {
      pushParty("supplier", String(s.id), s.name);
    }
    for (const m of staff as StaffRow[]) {
      pushParty("staff", String(m.user), m.user_name || m.user_phone || `Staff user #${m.user}`);
    }

    for (const r of ledgerRows) {
      const pt = r.party_type as LedgerPartyKind;
      if (pt !== "customer" && pt !== "staff" && pt !== "supplier") continue;
      const k = `${pt}:${r.party_id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const t = totals.get(k) ?? { credit: 0, debit: 0 };
      out.push({
        id: k,
        partyType: pt,
        partyId: r.party_id,
        name: `Unknown ${pt} #${r.party_id}`,
        totalCredit: t.credit,
        totalDebit: t.debit,
        balance: t.credit - t.debit,
      });
    }

    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, suppliers, staff, ledgerRows, totals]);

  const filtered = useMemo(() => {
    if (tab === "all") return parties;
    return parties.filter((p) => p.partyType === tab);
  }, [parties, tab]);

  const partyDetailTo =
    portal === "owner"
      ? "/owner/ledger/$partyType/$partyId"
      : portal === "staff"
        ? "/staff/ledger/$partyType/$partyId"
        : "/customer/ledger/$partyType/$partyId";

  const openParty = (p: LedgerPartyRow) => {
    void navigate({
      to: partyDetailTo,
      params: { partyType: p.partyType, partyId: p.partyId },
    });
  };

  if (error) return <p className="text-sm text-error">Failed to load ledger.</p>;
  if (isLoading) return <p className="text-sm text-text-muted">Loading…</p>;

  return (
    <ListPageShell
      header={
        <>
          <h2 className="mb-4 font-display text-lg font-semibold text-foreground">Ledger</h2>
          <p className="mb-4 text-xs text-text-muted">
            Parties at this restaurant — open a party to view and manage ledger lines.
          </p>

          <Tabs value={tab} onValueChange={(v) => setTab(v as PartyTab)} className="mb-4">
            <TabsList className="flex w-full flex-wrap justify-start gap-1 sm:w-auto">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="supplier">Supplier</TabsTrigger>
              <TabsTrigger value="staff">Staff</TabsTrigger>
              <TabsTrigger value="customer">Customer</TabsTrigger>
            </TabsList>
          </Tabs>
        </>
      }
    >
      <PaginatedList
        items={filtered}
        enablePagination={portal !== "owner"}
        enableSelection={portal !== "owner"}
        resetDeps={[tab]}
        empty={<p className="text-sm text-text-muted">No parties match this filter.</p>}
        renderItem={(row, sel) => (
            <OwnerEntityCard
              {...(sel.selectable ? sel : {})}
              onClick={() => openParty(row)}
              leading={partyLeadingIcon(row.partyType)}
              title={row.name}
              subtitle={
                <span className="inline-flex items-center gap-1.5 capitalize text-text-secondary">
                  <BookOpen size={14} className="shrink-0 text-primary" aria-hidden />
                  {row.partyType} ledger
                </span>
              }
              meta={
                <>
                  <span className="font-mono text-base font-semibold text-foreground">{money(row.balance)}</span>
                  <StatusBadge status={row.partyType} />
                  <span className="text-xs tabular-nums text-text-muted">
                    <span className="text-success">Cr {money(row.totalCredit)}</span>
                    <span className="mx-1">·</span>
                    <span className="text-error">Dr {money(row.totalDebit)}</span>
                  </span>
                </>
              }
              actions={
                <Link
                  to={partyDetailTo}
                  params={{ partyType: row.partyType, partyId: row.partyId }}
                  onClick={(e) => e.stopPropagation()}
                  className={ownerListActionClass}
                >
                  View ledger
                </Link>
              }
            />
        )}
      />
    </ListPageShell>
  );
}
