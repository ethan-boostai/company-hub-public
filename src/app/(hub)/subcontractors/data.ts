import "server-only";
import type postgres from "postgres";
import { readDb } from "@/lib/db";
import { getOptions } from "@/lib/select-options";
import { isoDate } from "../_registers/form-values";
import { DEFAULT_DOC_ITEMS, DEFAULT_TRADES, DOC_ITEM_LIST, mergeOptions, TRADE_LIST, type Kind } from "./rules";

// One row per company on the combined screen. Subcontractors use mobile, suppliers phone; both
// show as "phone".
export type CompanyRow = {
  kind: Kind;
  id: number;
  name: string;
  trade: string;
  contact: string;
  email: string;
  phone: string;
  approved: boolean;   // subcontractors only
  inducted: boolean;   // subcontractors only
  address: string;     // suppliers only
  accountNo: string;   // suppliers only
  notes: string;
};

export type DocRow = {
  id: number;
  kind: Kind;
  companyId: number;
  item: string;
  reference: string;
  issuedOn: string | null;
  expiresOn: string | null;
  notes: string;
};

export type CompaniesData = { companies: CompanyRow[]; docs: DocRow[]; trades: string[]; docItems: string[] };

type Sql = postgres.Sql | postgres.TransactionSql;
const s = (v: unknown) => (v == null ? "" : String(v));

/* eslint-disable @typescript-eslint/no-explicit-any */
function toSub(r: any): CompanyRow {
  return {
    kind: "subcontractor", id: Number(r.id), name: r.company, trade: s(r.trade), contact: s(r.contact), email: s(r.email),
    phone: s(r.mobile), approved: r.approved, inducted: r.inducted, address: "", accountNo: "", notes: s(r.notes),
  };
}
function toSupplier(r: any): CompanyRow {
  return {
    kind: "supplier", id: Number(r.id), name: r.name, trade: s(r.trade), contact: s(r.contact), email: s(r.email),
    phone: s(r.phone), approved: false, inducted: false, address: s(r.address), accountNo: s(r.account_no), notes: s(r.notes),
  };
}
function toDoc(r: any): DocRow {
  return {
    id: Number(r.id), kind: r.subcontractor_id ? "subcontractor" : "supplier", companyId: Number(r.subcontractor_id ?? r.supplier_id),
    item: r.item, reference: s(r.reference), issuedOn: isoDate(r.issued_on), expiresOn: isoDate(r.expires_on), notes: s(r.notes),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function loadCompanies(): Promise<CompaniesData> {
  const sql = await readDb();
  const [subs, sups, docs, trades, items] = await Promise.all([
    sql`select * from subcontractors order by lower(company)`,
    sql`select * from suppliers order by lower(name)`,
    sql`select * from subcontractor_docs order by expires_on nulls last, id`,
    getOptions(TRADE_LIST),
    getOptions(DOC_ITEM_LIST),
  ]);
  const companies = [...subs.map(toSub), ...sups.map(toSupplier)].sort((a, b) => a.name.localeCompare(b.name));
  return {
    companies,
    docs: docs.map(toDoc),
    trades: mergeOptions(DEFAULT_TRADES, trades),
    docItems: mergeOptions(DEFAULT_DOC_ITEMS, items),
  };
}

export async function loadCompany(sql: Sql, kind: Kind, id: number): Promise<CompanyRow | null> {
  if (kind === "subcontractor") {
    const [r] = await sql`select * from subcontractors where id = ${id}`;
    return r ? toSub(r) : null;
  }
  const [r] = await sql`select * from suppliers where id = ${id}`;
  return r ? toSupplier(r) : null;
}

export async function loadDoc(sql: Sql, id: number): Promise<DocRow | null> {
  const [r] = await sql`select * from subcontractor_docs where id = ${id}`;
  return r ? toDoc(r) : null;
}
