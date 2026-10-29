import "server-only";
import { readDb } from "@/lib/db";
import { getOptions } from "@/lib/select-options";
import { mergeOptions } from "../(hub)/subcontractors/rules";
import { CATEGORY_LIST, DEFAULT_CATEGORIES } from "../(hub)/requests/rules";
import { DEFAULT_KINDS, KIND_LIST } from "../(hub)/people/time-off/rules";

// Only what the team app's forms need: names (crew list), vehicle regs, request categories, tools and
// the types of time off.
export type TeamData = { names: string[]; vehicles: { id: number; label: string }[]; categories: string[]; tools: { id: number; label: string }[]; leaveKinds: string[] };

export async function loadTeamData(): Promise<TeamData> {
  const sql = await readDb();
  const [people, vehicles, cats, tools, kinds] = await Promise.all([
    sql<{ name: string }[]>`select name from people where active and 'crew' = any(lists) order by lower(name)`,
    sql<{ id: string; reg: string; make_model: string | null }[]>`select id, reg, make_model from vehicles order by reg`,
    getOptions(CATEGORY_LIST),
    // Equipment the crew can report: everything not already lost or retired.
    sql<{ id: string; name: string; asset_tag: string | null; serial_no: string | null }[]>`
      select id, name, asset_tag, serial_no from assets where status not in ('lost', 'retired') order by lower(name), asset_tag`,
    getOptions(KIND_LIST),
  ]);
  return {
    names: people.map((p) => p.name),
    vehicles: vehicles.map((v) => ({ id: Number(v.id), label: v.make_model ? `${v.reg} - ${v.make_model}` : v.reg })),
    // "Other" always last: the crew choose it and type their own.
    categories: [...mergeOptions(DEFAULT_CATEGORIES, cats).filter((c) => c.toLowerCase() !== "other"), "Other"],
    tools: tools.map((t) => ({
      id: Number(t.id),
      label: `${t.name}${t.asset_tag ? ` (${t.asset_tag})` : ""}${t.serial_no ? ` S/N ${t.serial_no}` : ""}`,
    })),
    leaveKinds: mergeOptions(DEFAULT_KINDS, kinds),
  };
}
