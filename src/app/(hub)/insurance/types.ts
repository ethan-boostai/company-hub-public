import type { Saved } from "./actions";
import type { InsuranceData } from "./data";

// What the drawer is showing.
export type Open =
  | { kind: "policy"; id: number | null; renewFrom?: number }
  | { kind: "claim"; id: number | null; vehicleId?: number; accidentId?: number; assetId?: number; policyId?: number }
  | { kind: "cert"; id: number | null };

export type Common = {
  data: InsuranceData;
  today: string;
  onOpen: (o: Open | null) => void;
  // After a save or delete: the fresh register, and what to show next.
  onSaved: (s: Saved, next: Open | null) => void;
};
