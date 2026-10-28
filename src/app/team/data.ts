import "server-only";
import { readDb } from "@/lib/db";
import { getOptions } from "@/lib/select-options";
import { mergeOptions } from "../(hub)/subcontractors/rules";
import { CATEGORY_LIST, DEFAULT_CATEGORIES } from "../(hub)/requests/rules";

// Only what the team app's forms need: names (crew list), vehicle regs and request categories.
export type TeamData = { names: string[]; vehicles: { id: number; label: string }[]; categories: string[] };

export async function loadTeamData(): Promise<TeamData> {
  const sql = await readDb();
  const [people, vehicles, cats] = await Promise.all([
    sql<{ name: string }[]>`select name from people where active and 'crew' = any(lists) order by lower(name)`,
    sql<{ id: string; reg: string; make_model: string | null }[]>`select id, reg, make_model from vehicles order by reg`,
    getOptions(CATEGORY_LIST),
  ]);
  return {
    names: people.map((p) => p.name),
    vehicles: vehicles.map((v) => ({ id: Number(v.id), label: v.make_model ? `${v.reg} - ${v.make_model}` : v.reg })),
    categories: mergeOptions(DEFAULT_CATEGORIES, cats),
  };
}
