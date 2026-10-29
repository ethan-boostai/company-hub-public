// Imports the old hub's insurance policies, claims and company accreditations (docs/plan.md section 4).
// Re-runnable: rows are matched on legacy ids, so running it again updates rather than duplicates.
//
// Input: a folder of JSON exports of the n8n tables, one file per table, named
//   cbs_insurance.json, cbs_claims.json, cbs_company_certs.json
// Each file holds an array of rows, or an object with the rows under "rows", "data" or "sample_rows".
// Run the Fleet and Equipment imports first: claims are linked to vehicles and equipment.
//
// Rules (plan approved by Ethan 30/10/2026; "flag, don't guess"):
// - Each old policy row is one period. Its covers come from cover_json (type, limit, excess). If
//   cover_json is empty, a plain number in the old "cover" box becomes the limit of the cover that
//   matches the policy type (listed in the report); anything else in "cover" is kept in the notes.
// - "Other" policy types, accreditation names and the like take the name typed under them; if none
//   was typed, the row is flagged.
// - Claim direction and status must be one of the old fixed values. A blank direction is "By us" and
//   a blank status is "Open" (the old form's defaults, listed in the report); any other value is
//   flagged and the claim is skipped.
// - Claim links (policy, vehicle, equipment) are matched exactly; anything that doesn't match is
//   flagged and kept in the claim's notes. The job number and incident reference stay as text.
// - Old claim numbers (CLM-nnn) are kept, and new claims carry on after the highest one.
// - Accreditation contact notes that look like they hold a password are flagged and not imported.
// - Old document links (doc_url, docs_json) become files rows holding the SharePoint link.
//
// Usage (dry run: reads and reports, writes nothing):
//   DATABASE_URL=... node scripts/migrate/registers-insurance.ts <export-folder>
// Write the rows (only at switch-over, when Ethan says so):
//   DATABASE_URL=... node scripts/migrate/registers-insurance.ts <export-folder> --apply
import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

type Row = Record<string, unknown>;
type Tx = postgres.TransactionSql;
class DryRun extends Error {}
const only = (v: Row, keys: string[]): Row => Object.fromEntries(keys.map((k) => [k, v[k]]));

const [dir] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const apply = process.argv.includes("--apply");
const url = process.env.DATABASE_URL;
if (!dir || !url) {
  console.error("Usage: DATABASE_URL=... node scripts/migrate/registers-insurance.ts <export-folder> [--apply]");
  process.exit(1);
}

async function readTable(name: string): Promise<Row[]> {
  const raw = JSON.parse(await readFile(path.join(dir, `${name}.json`), "utf8").catch(() => "[]"));
  return (Array.isArray(raw) ? raw : raw.rows ?? raw.data ?? raw.sample_rows ?? []) as Row[];
}

const text = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).replace(/\s+/g, " ").trim();
  return s || null;
};
const longText = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).trim();
  return s || null;
};
const key = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const joinNotes = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join("\n") || null;
const isOther = (v: unknown) => /^other\b/i.test(String(v ?? "").trim());

// A date, or null; a value that isn't a real date is flagged.
function dateOf(v: unknown, what: string, flags: string[]): string | null {
  const s = text(v)?.slice(0, 10);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`))) return s;
  flags.push(`${what}: "${text(v)}" is not a date (left blank)`);
  return null;
}

// Pounds: "£1,250.50" -> "1250.50". Anything else is flagged (and the caller keeps it in the notes).
function poundsOf(v: unknown, what: string, flags: string[]): { value: string | null; bad: string | null } {
  const raw = text(v);
  if (!raw) return { value: null, bad: null };
  const s = raw.replace(/[£,\s]/g, "");
  if (/^\d{1,12}(\.\d{1,2})?$/.test(s)) return { value: Number(s).toFixed(2), bad: null };
  flags.push(`${what}: "${raw}" is not an amount in pounds (kept in the notes)`);
  return { value: null, bad: raw };
}

function fileName(link: string): string {
  try {
    return decodeURIComponent(new URL(link).pathname.split("/").filter(Boolean).pop() ?? "") || "Document";
  } catch {
    return "Document";
  }
}

function docsOf(r: Row, what: string, flags: string[]): { name: string; url: string }[] {
  const out: { name: string; url: string }[] = [];
  const link = text(r.doc_url);
  if (link) out.push({ name: fileName(link), url: link });
  if (r.docs_json) {
    try {
      const list = typeof r.docs_json === "string" ? JSON.parse(r.docs_json || "[]") : r.docs_json;
      for (const d of Array.isArray(list) ? list : []) {
        const u = text(d?.url);
        if (u) out.push({ name: text(d?.name) ?? fileName(u), url: u });
      }
    } catch {
      flags.push(`${what}: its document list can't be read (no files linked)`);
    }
  }
  return out;
}

async function linkFiles(tx: Tx, table: string, id: number, docs: { name: string; url: string }[]) {
  for (const d of docs) {
    const [exists] = await tx`select 1 from files where entity_table = ${table} and entity_id = ${id} and sharepoint_url = ${d.url}`;
    if (!exists) {
      await tx`insert into files (name, storage, sharepoint_url, entity_table, entity_id, role, created_by)
               values (${d.name}, 'sharepoint', ${d.url}, ${table}, ${id}, 'document', 'Import')`;
    }
  }
  return docs.length;
}

// The cover that an old policy type's single "cover" amount belongs to.
const COVER_FOR_TYPE: Record<string, string> = {
  "public liability": "Public liability",
  "employers liability": "Employer's liability",
  "employer's liability": "Employer's liability",
  "motor vehicle": "Motor vehicle / fleet",
  "contract works": "Contract works",
  "professional indemnity": "Professional indemnity",
  "tools and plant": "Tools and plant",
  "goods in transit": "Goods in transit",
  "material damage": "Material damage",
  "business interruption": "Business interruption",
};

const DIRECTIONS: Record<string, string> = { "by us": "by_us", "against us": "against_us" };
const STATUSES = ["open", "lodged", "assessing", "approved", "declined", "settled", "closed", "withdrawn"];
const PASSWORD = /pass(word)?\s*[:=]|pwd\s*[:=]|\bpw\s*[:=]/i;

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
const host = (() => {
  try {
    return new URL(url).host;
  } catch {
    return "(unknown)";
  }
})();
console.log(`${apply ? "IMPORTING INTO" : "Dry run against"} ${host}, from ${dir}`);
const report: string[] = [];
const flags: string[] = [];

try {
  const [policyRows, claimRows, certRows] = await Promise.all(["cbs_insurance", "cbs_claims", "cbs_company_certs"].map(readTable));

  await sql.begin(async (tx) => {
    /* ---------- Policies ---------- */
    const policyByLegacy = new Map<string, number>();
    const policyByTitle = new Map<string, number[]>();
    const policyByNo = new Map<string, number[]>();
    const add = (m: Map<string, number[]>, k: string | null, id: number) => k && m.set(key(k), [...(m.get(key(k)) ?? []), id]);
    let policies = 0;
    let coverLines = 0;
    let files = 0;
    for (const r of policyRows) {
      const what = `policy ${r.id}`;
      let type = text(r.item);
      let name = text(r.custom_name);
      if (!type) {
        flags.push(`${what}: no policy type (skipped)`);
        continue;
      }
      if (isOther(type)) {
        if (!name) {
          flags.push(`${what}: type "Other" with no name typed under it (imported as "Other")`);
          type = "Other";
        } else {
          type = name;
          name = null;
        }
      }
      const notes: (string | null)[] = [longText(r.notes)];

      // Covers.
      const covers: { cover: string; limit_amount: string | null; excess: string | null }[] = [];
      let list: unknown[] = [];
      try {
        const parsed = typeof r.cover_json === "string" ? JSON.parse(r.cover_json || "[]") : r.cover_json ?? [];
        list = Array.isArray(parsed) ? parsed : [];
      } catch {
        flags.push(`${what}: its cover list can't be read (kept in the notes)`);
        notes.push(`Covers in the old hub: ${String(r.cover_json)}`);
      }
      for (const c of list as Row[]) {
        const cover = text(c?.type) ?? text(c?.cover);
        const limit = poundsOf(c?.limit, `${what} cover "${cover ?? "?"}" limit`, flags);
        const excess = poundsOf(c?.excess, `${what} cover "${cover ?? "?"}" excess`, flags);
        if (!cover) {
          flags.push(`${what}: a cover line has no cover type (kept in the notes)`);
          notes.push(`Cover line with no type: limit ${text(c?.limit) ?? "-"}, excess ${text(c?.excess) ?? "-"}`);
          continue;
        }
        if (limit.bad || excess.bad) notes.push(`${cover}: limit ${limit.bad ?? text(c?.limit) ?? "-"}, excess ${excess.bad ?? text(c?.excess) ?? "-"}`);
        covers.push({ cover, limit_amount: limit.value, excess: excess.value });
      }
      const coverBox = text(r.cover);
      if (coverBox) {
        const amount = coverBox.replace(/[£,\s]/g, "");
        const matching = COVER_FOR_TYPE[key(type)];
        if (covers.length === 0 && /^\d{1,12}(\.\d{1,2})?$/.test(amount) && matching) {
          covers.push({ cover: matching, limit_amount: Number(amount).toFixed(2), excess: null });
          report.push(`  ${what} (${type}): old cover amount ${coverBox} became the ${matching} limit`);
        } else {
          notes.push(`Cover (old hub): ${coverBox}`);
        }
      }

      const starts = dateOf(r.starts_on, `${what} start`, flags);
      let expires = dateOf(r.expires_on, `${what} expiry`, flags);
      if (starts && expires && expires < starts) {
        flags.push(`${what}: expires (${expires}) before it starts (${starts}); expiry left blank`);
        notes.push(`Expiry in the old hub: ${expires}`);
        expires = null;
      }
      const v: Row = {
        policy_type: type, name, insurer: text(r.insurer), policy_no: text(r.policy_no), starts_on: starts, expires_on: expires,
        notes: joinNotes(...notes), legacy_id: Number(r.id), created_by: "Import",
      };
      const [row] = await tx<{ id: string }[]>`
        insert into insurance_policies ${tx(v)}
        on conflict (legacy_id) do update set ${tx(only(v, ["policy_type", "name", "insurer", "policy_no", "starts_on", "expires_on", "notes"]))}, updated_by = 'Import'
        returning id`;
      const id = Number(row.id);
      await tx`delete from insurance_covers where policy_id = ${id}`;
      for (const [i, c] of covers.entries()) await tx`insert into insurance_covers ${tx({ policy_id: id, ...c, sort: i })}`;
      coverLines += covers.length;
      files += await linkFiles(tx, "insurance_policies", id, docsOf(r, what, flags));
      policyByLegacy.set(String(r.id), id);
      add(policyByTitle, name ? `${type} - ${name}` : type, id);
      add(policyByTitle, type, id);
      add(policyByNo, text(r.policy_no), id);
      policies++;
    }
    report.unshift(`policies: ${policyRows.length} in, ${policies} imported with ${coverLines} cover line(s), ${files} document link(s)`);

    /* ---------- Claims ---------- */
    const vehicles = new Map(
      (await tx<{ id: string; reg: string }[]>`select id, reg from vehicles`).map((v) => [v.reg.replace(/\s+/g, "").toUpperCase(), Number(v.id)]),
    );
    const assets = await tx<{ id: string; name: string; asset_tag: string | null; legacy_id: string | null }[]>`select id, name, asset_tag, legacy_id from assets`;
    const one = (ids: number[] | undefined) => (ids && new Set(ids).size === 1 ? ids[0] : null);
    let claims = 0;
    let claimFiles = 0;
    let highest = 0;
    const defaulted: string[] = [];
    for (const r of claimRows) {
      const what = `claim ${text(r.claim_no) ?? `id ${r.id}`}`;
      const type = isOther(r.claim_type) ? null : text(r.claim_type);
      if (!type) {
        flags.push(`${what}: no claim type${isOther(r.claim_type) ? ' ("Other")' : ""} (skipped)`);
        continue;
      }
      const dirRaw = key(r.direction);
      const direction = dirRaw ? DIRECTIONS[dirRaw] : "by_us";
      if (!direction) {
        flags.push(`${what}: direction "${text(r.direction)}" isn't By us or Against us (skipped)`);
        continue;
      }
      const statusRaw = key(r.status);
      const status = statusRaw ? (STATUSES.includes(statusRaw) ? statusRaw : null) : "open";
      if (!status) {
        flags.push(`${what}: status "${text(r.status)}" isn't one of the old statuses (skipped)`);
        continue;
      }
      if (!dirRaw) defaulted.push(`${what}: blank direction set to By us`);
      if (!statusRaw) defaulted.push(`${what}: blank status set to Open`);
      const notes: (string | null)[] = [longText(r.notes)];

      // Policy: an old id, the policy title ("Type - Name"), or the policy number. Exact matches only.
      let policyId: number | null = null;
      const policyRaw = text(r.policy);
      if (policyRaw) {
        policyId = policyByLegacy.get(policyRaw) ?? one(policyByTitle.get(key(policyRaw))) ?? one(policyByNo.get(key(policyRaw)));
        if (!policyId) {
          flags.push(`${what}: policy "${policyRaw}" doesn't match one policy (kept in the notes)`);
          notes.push(`Policy (old hub): ${policyRaw}`);
        }
      }
      // Vehicle: by registration (spaces and case ignored).
      let vehicleId: number | null = null;
      const vehicleRaw = text(r.vehicle);
      if (vehicleRaw) {
        const reg = vehicleRaw.replace(/\s*\(.*\)\s*$/, "").replace(/\s+/g, "").toUpperCase();
        vehicleId = vehicles.get(reg) ?? null;
        if (!vehicleId) {
          flags.push(`${what}: vehicle "${vehicleRaw}" not found (kept in the notes)`);
          notes.push(`Vehicle (old hub): ${vehicleRaw}`);
        }
      }
      // Equipment: by old id, asset tag, "Name (TAG)" or a unique name.
      let assetId: number | null = null;
      const assetRaw = text(r.asset);
      if (assetRaw) {
        const tag = /\(([^)]+)\)\s*$/.exec(assetRaw)?.[1];
        const byLegacy = assets.filter((a) => a.legacy_id && String(a.legacy_id) === assetRaw);
        const byTag = assets.filter((a) => a.asset_tag && [key(assetRaw), key(tag)].includes(key(a.asset_tag)));
        const byName = assets.filter((a) => key(a.name) === key(assetRaw.replace(/\s*\([^)]*\)\s*$/, "")));
        const hit = [byLegacy, byTag, byName].find((l) => l.length === 1);
        assetId = hit ? Number(hit[0].id) : null;
        if (!assetId) {
          flags.push(`${what}: equipment "${assetRaw}" doesn't match one item (kept in the notes)`);
          notes.push(`Equipment (old hub): ${assetRaw}`);
        }
      }

      const amounts = Object.fromEntries((["amount_claimed", "excess", "amount_settled"] as const).map((k) => {
        const p = poundsOf(r[k], `${what} ${k.replace("_", " ")}`, flags);
        if (p.bad) notes.push(`${k.replace("_", " ")} (old hub): ${p.bad}`);
        return [k, p.value];
      }));
      const claimNo = text(r.claim_no);
      const m = claimNo ? /^CLM-(\d+)$/i.exec(claimNo) : null;
      if (claimNo && !m) flags.push(`${what}: claim number "${claimNo}" isn't CLM-nnn (kept as it is)`);
      if (m) highest = Math.max(highest, Number(m[1]));

      const v: Row = {
        claim_type: type, direction, status,
        incident_date: dateOf(r.incident_date, `${what} incident date`, flags),
        lodged_on: dateOf(r.lodged_on, `${what} lodged date`, flags),
        closed_on: dateOf(r.closed_on, `${what} closed date`, flags),
        policy_id: policyId, insurer: text(r.insurer), insurer_claim_no: text(r.insurer_claim_no),
        other_party: text(r.other_party), other_contact: text(r.other_contact), description: longText(r.description),
        ...amounts, vehicle_id: vehicleId, asset_id: assetId,
        incident_ref: text(r.incident_ref), job_no: text(r.job_no), site: text(r.site), client: text(r.client),
        next_action: text(r.next_action), next_action_due: dateOf(r.next_action_due, `${what} next action date`, flags),
        notes: joinNotes(...notes), legacy_id: Number(r.id), created_by: "Import",
      };
      if (claimNo) {
        const no = m ? `CLM-${m[1]}` : claimNo;
        const [taken] = await tx`select id from claims where claim_no = ${no} and legacy_id is distinct from ${Number(r.id)}`;
        if (taken) flags.push(`${what}: claim number ${no} is already used by a claim made in the new hub (given a new number)`);
        else v.claim_no = no;
      }
      const updatable = Object.keys(v).filter((k) => !["legacy_id", "created_by"].includes(k));
      const [row] = await tx<{ id: string }[]>`
        insert into claims ${tx(v)}
        on conflict (legacy_id) do update set ${tx(only(v, updatable))}, updated_by = 'Import'
        returning id`;
      claimFiles += await linkFiles(tx, "claims", Number(row.id), docsOf(r, what, flags));
      claims++;
    }
    // New claims carry on after the highest old number.
    if (highest > 0) await tx`select setval('claims_no_seq', greatest(${highest}, (select last_value from claims_no_seq)))`;
    report.push(`claims: ${claimRows.length} in, ${claims} imported, ${claimFiles} document link(s)${highest ? `; new claims start after CLM-${String(highest).padStart(3, "0")}` : ""}`);
    for (const d of defaulted) report.push(`  ${d}`);

    /* ---------- Accreditations ---------- */
    let certs = 0;
    let certFiles = 0;
    for (const r of certRows) {
      const what = `accreditation ${r.id}`;
      let name = text(r.name);
      if (isOther(name)) {
        name = text(r.other_name);
        if (!name) {
          flags.push(`${what}: "Other" with no name typed under it (imported as "Other")`);
          name = "Other";
        }
      }
      if (!name) {
        flags.push(`${what}: no name (skipped)`);
        continue;
      }
      const notes: (string | null)[] = [longText(r.notes)];
      const cost = poundsOf(r.cost, `${what} (${name}) annual cost`, flags);
      if (cost.bad) notes.push(`Annual cost (old hub): ${cost.bad}`);
      let contact = longText(r.contact);
      if (contact && PASSWORD.test(contact)) {
        flags.push(`${what} (${name}): contact notes look like they hold a password; not imported. Move it to the password manager.`);
        contact = null;
      }
      const issued = dateOf(r.issued_on, `${what} issued date`, flags);
      let expires = dateOf(r.expires_on, `${what} expiry`, flags);
      if (issued && expires && expires < issued) {
        flags.push(`${what} (${name}): expires (${expires}) before it was issued (${issued}); expiry left blank`);
        notes.push(`Expiry in the old hub: ${expires}`);
        expires = null;
      }
      const v: Row = {
        name, issuer: text(r.issuer), reference: text(r.reference), level: text(r.level), issued_on: issued, expires_on: expires,
        annual_cost: cost.value, contact_notes: contact, notes: joinNotes(...notes), legacy_id: Number(r.id), created_by: "Import",
      };
      const [row] = await tx<{ id: string }[]>`
        insert into company_certs ${tx(v)}
        on conflict (legacy_id) do update set ${tx(only(v, ["name", "issuer", "reference", "level", "issued_on", "expires_on", "annual_cost", "contact_notes", "notes"]))}, updated_by = 'Import'
        returning id`;
      certFiles += await linkFiles(tx, "company_certs", Number(row.id), docsOf(r, what, flags));
      certs++;
    }
    report.push(`accreditations: ${certRows.length} in, ${certs} imported, ${certFiles} document link(s)`);

    if (!apply) throw new DryRun();
  });
} catch (e) {
  if (!(e instanceof DryRun)) {
    console.error("Import failed, nothing was saved:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}

for (const line of report) console.log(line);
if (flags.length) {
  console.log(`\nNeeds checking (${flags.length}):`);
  for (const line of flags) console.log(`  - ${line}`);
}
console.log(apply ? "\nDone." : "\nDry run only: nothing was saved. Add --apply to write.");
