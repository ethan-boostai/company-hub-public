"use server";

import { db } from "@/lib/db";
import { getCurrentPerson } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/action-types";

export type RecordFile = { id: number; name: string; mime: string; size: number; storage: string; by: string; at: string };

// Tables whose records can hold files on the register pages.
const TABLES = new Set([
  "vehicles", "vehicle_checks", "vehicle_services", "vehicle_accidents",
  "subcontractors", "suppliers", "subcontractor_docs", "requests",
  "assets", "asset_services", "materials", "tool_reports",
]);

// Files attached to one register record, newest first.
export async function listRecordFiles(entityTable: string, entityId: number): Promise<ActionResult<RecordFile[]>> {
  if (!(await getCurrentPerson())) return { ok: false, message: "You have been signed out. Sign in again." };
  if (!TABLES.has(entityTable) || !Number.isInteger(entityId) || entityId <= 0) return { ok: false, message: "Unknown record." };
  const rows = await db()<{ id: string; name: string; mime: string | null; size_bytes: string | null; storage: string; created_by: string | null; created_at: Date }[]>`
    select id, name, mime, size_bytes, storage, created_by, created_at from files
    where entity_table = ${entityTable} and entity_id = ${entityId} and superseded_by is null
    order by id desc`;
  return {
    ok: true,
    data: rows.map((r) => ({
      id: Number(r.id), name: r.name, mime: r.mime ?? "", size: Number(r.size_bytes ?? 0), storage: r.storage,
      by: r.created_by ?? "", at: r.created_at.toISOString(),
    })),
  };
}
