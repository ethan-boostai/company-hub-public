import type { Saved } from "./actions";
import type { EquipmentData } from "./data";

// What the drawer is showing.
export type Open =
  | { kind: "asset"; id: number | null }
  | { kind: "service"; id: number | null; assetId?: number }
  | { kind: "material"; id: number | null }
  | { kind: "move"; from?: string }
  | { kind: "stocktake"; id: number | null; location?: string }
  | { kind: "report"; id: number | null; assetId?: number };

export type Common = {
  data: EquipmentData;
  today: string;
  me: string;
  onOpen: (o: Open | null) => void;
  // After a save: the fresh register, and what to show next.
  onSaved: (s: Saved, next: Open | null) => void;
};
