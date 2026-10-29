import "server-only";
import type postgres from "postgres";

export type SignDocType = "rams" | "prestart" | "toolbox" | "cphsp";
type Sql = postgres.Sql | postgres.TransactionSql;

// A document people sign on to (its current issued revision).
export type SignDoc = {
  type: SignDocType;
  table: string; // the table the document lives in (files are recorded against it)
  id: number;
  jobId: number;
  jobNo: string;
  revision: number;
  label: string; // e.g. "RAMS rev 2: Roof repairs"
  issuedFileId: number | null; // the issued PDF
  issuedFileName: string;
  folder: string; // the job folder its files go in
  signedFileId: number | null; // the current signed copy
  signable: boolean; // issued and current: sign-ons are open
  acceptText: string; // what the person ticks to accept
};

// Each kind of document plugs in here (RAMS, pre-starts, toolbox talks, CPHSP inductions), so the
// signing page, the crew page and the signed copy work the same for all of them.
export type SignDocAdapter = {
  load: (sql: Sql, id: number) => Promise<SignDoc | null>;
  // Documents on this job that people can sign now (the crew page's "To sign").
  openForJob: (sql: Sql, jobId: number) => Promise<SignDoc[]>;
  // Record the new signed copy on the document.
  setSignedFile: (sql: Sql, id: number, fileId: number) => Promise<void>;
};

const ADAPTERS: Partial<Record<SignDocType, SignDocAdapter>> = {};

export function registerSignDoc(type: SignDocType, adapter: SignDocAdapter) {
  ADAPTERS[type] = adapter;
}

export async function loadSignDoc(sql: Sql, type: string, id: number): Promise<SignDoc | null> {
  const a = ADAPTERS[type as SignDocType];
  return a && Number.isInteger(id) && id > 0 ? a.load(sql, id) : null;
}

export async function openSignDocs(sql: Sql, jobId: number): Promise<SignDoc[]> {
  const out: SignDoc[] = [];
  for (const a of Object.values(ADAPTERS)) if (a) out.push(...(await a.openForJob(sql, jobId)));
  return out;
}

export function signAdapter(type: SignDocType): SignDocAdapter | undefined {
  return ADAPTERS[type];
}

export const DEFAULT_ACCEPT = "I have read and understood this document, and I will follow it.";
