"use server";

import { db } from "@/lib/db";
import { guarded, type ActionResult } from "@/lib/actions";
import { REQUEST_KEY_FIELD } from "@/lib/action-types";
import { diff, logActivity } from "@/lib/activity";
import { emailError, forLog, FormValues } from "../_registers/form-values";
import { loadCompany, loadDoc, type CompanyRow, type DocRow } from "./data";
import type { Kind } from "./rules";

type Row = Record<string, unknown>;
const GONE = { ok: false as const, message: "That record no longer exists. Refresh the page." };
class Missing extends Error {}

function invalid(fieldErrors: Record<string, string>): ActionResult<never> {
  return { ok: false, message: "Check the highlighted fields.", fieldErrors };
}

const SUB_FIELDS = ["company", "trade", "contact", "email", "mobile", "approved", "inducted", "notes"];
const SUPPLIER_FIELDS = ["name", "trade", "contact", "email", "phone", "address", "account_no", "notes"];

// Saves a subcontractor or a supplier (the form says which).
export async function saveCompany(form: FormData): Promise<ActionResult<CompanyRow>> {
  const f = new FormValues(form);
  const id = f.id("id");
  const kind = f.oneOf<Kind>("kind", ["subcontractor", "supplier"], "subcontractor");
  const name = f.required("name", "Enter the company name.", 200).replace(/\s+/g, " ");
  const common = { trade: f.text("trade", 120), contact: f.text("contact", 120), email: f.text("email", 200)?.toLowerCase() ?? null, notes: f.text("notes", 4000) };
  const e = emailError(common.email);
  if (e) f.errors.email = e;
  const table = kind === "subcontractor" ? "subcontractors" : "suppliers";
  const fields = kind === "subcontractor" ? SUB_FIELDS : SUPPLIER_FIELDS;
  const v: Row = kind === "subcontractor"
    ? { company: name, ...common, mobile: f.text("phone", 60), approved: f.bool("approved"), inducted: f.bool("inducted") }
    : { name, ...common, phone: f.text("phone", 60), address: f.text("address", 500), account_no: f.text("account_no", 60) };
  if (!f.ok) return invalid(f.errors);

  return guarded<CompanyRow>(form.get(REQUEST_KEY_FIELD), async (person) => {
    try {
      const row = await db().begin(async (tx) => {
        let rowId = id;
        if (id) {
          const [before] = await tx`select ${tx(fields)} from ${tx(table)} where id = ${id} for update`;
          if (!before) throw new Missing();
          await tx`update ${tx(table)} set ${tx(v)}, updated_by = ${person.name} where id = ${id}`;
          const changes = diff(forLog(before), v, fields);
          if (Object.keys(changes).length) await logActivity(tx, { person: person.name, table, rowId: id, action: "update", changes });
        } else {
          const [r] = await tx<{ id: string }[]>`insert into ${tx(table)} ${tx({ ...v, created_by: person.name })} returning id`;
          rowId = Number(r.id);
          await logActivity(tx, { person: person.name, table, rowId, action: "create", changes: diff(null, v, fields) });
        }
        return (await loadCompany(tx, kind, rowId!))!;
      });
      return { ok: true, message: "Saved.", data: row };
    } catch (err) {
      if (err instanceof Missing) return GONE;
      if ((err as { code?: string }).code === "23505") {
        return invalid({ name: `There is already a ${kind} with that name.` });
      }
      throw err;
    }
  });
}

const DOC_FIELDS = ["subcontractor_id", "supplier_id", "item", "reference", "issued_on", "expires_on", "notes"];

export async function saveDoc(form: FormData): Promise<ActionResult<DocRow>> {
  const f = new FormValues(form);
  const id = f.id("id");
  const kind = f.oneOf<Kind>("kind", ["subcontractor", "supplier"], "subcontractor");
  const companyId = f.id("company_id");
  const v: Row = {
    subcontractor_id: kind === "subcontractor" ? companyId : null,
    supplier_id: kind === "supplier" ? companyId : null,
    item: f.required("item", "Choose what the document is.", 120),
    reference: f.text("reference", 120),
    issued_on: f.date("issued_on"),
    expires_on: f.date("expires_on"),
    notes: f.text("notes", 4000),
  };
  if (!companyId) return { ok: false, message: "Open the company first." };
  if (v.issued_on && v.expires_on && (v.expires_on as string) < (v.issued_on as string)) f.errors.expires_on = "Expires before it was issued.";
  if (!f.ok) return invalid(f.errors);

  return guarded<DocRow>(form.get(REQUEST_KEY_FIELD), async (person) => {
    try {
      const row = await db().begin(async (tx) => {
        let rowId = id;
        if (id) {
          const [before] = await tx`select ${tx(DOC_FIELDS)} from subcontractor_docs where id = ${id} for update`;
          if (!before) throw new Missing();
          await tx`update subcontractor_docs set ${tx(v)}, updated_by = ${person.name} where id = ${id}`;
          const changes = diff(forLog(before), v, DOC_FIELDS);
          if (Object.keys(changes).length) await logActivity(tx, { person: person.name, table: "subcontractor_docs", rowId: id, action: "update", changes });
        } else {
          const [company] = await tx`select id from ${tx(kind === "subcontractor" ? "subcontractors" : "suppliers")} where id = ${companyId}`;
          if (!company) throw new Missing();
          const [r] = await tx<{ id: string }[]>`insert into subcontractor_docs ${tx({ ...v, created_by: person.name })} returning id`;
          rowId = Number(r.id);
          await logActivity(tx, { person: person.name, table: "subcontractor_docs", rowId, action: "create", changes: diff(null, v, DOC_FIELDS) });
        }
        return (await loadDoc(tx, rowId!))!;
      });
      return { ok: true, message: "Saved.", data: row };
    } catch (err) {
      if (err instanceof Missing) return GONE;
      throw err;
    }
  });
}

const DELETABLE = { subcontractors: "subcontractors", suppliers: "suppliers", subcontractor_docs: "subcontractor_docs" } as const;

// Deletes a company (and its documents, which the confirm step says) or one document.
// Files stay in SharePoint.
export async function deleteCompanyRecord(table: keyof typeof DELETABLE, id: number, requestKey: string): Promise<ActionResult> {
  if (!DELETABLE[table] || !Number.isInteger(id) || id <= 0) return { ok: false, message: "Unknown record." };
  return guarded(requestKey, async (person) => {
    return db().begin(async (tx) => {
      const [before] = await tx`select * from ${tx(table)} where id = ${id} for update`;
      if (!before) return GONE;
      await tx`delete from ${tx(table)} where id = ${id}`;
      const snapshot = Object.fromEntries(
        Object.entries(forLog(before)).filter(([k]) => !["id", "created_at", "updated_at"].includes(k)).map(([k, val]) => [k, [val, null] as [unknown, unknown]]),
      );
      await logActivity(tx, { person: person.name, table, rowId: id, action: "delete", changes: snapshot });
      return { ok: true, message: "Deleted." };
    });
  });
}
