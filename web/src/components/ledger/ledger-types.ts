export type LedgerPartyKind = "customer" | "staff" | "supplier";

export interface LedgerListRow {
  id: number;
  restaurant?: number;
  restaurant_name?: string;
  party_type: string;
  party_id: string;
  particular: string;
  amount: string | number;
  type: string;
  created_at: string;
}

export interface LedgerPartyRow {
  id: string;
  partyType: LedgerPartyKind;
  partyId: string;
  name: string;
  balance: number;
  totalCredit: number;
  totalDebit: number;
}
