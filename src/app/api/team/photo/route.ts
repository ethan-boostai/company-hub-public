import { db } from "@/lib/db";
import { claimRequestKey } from "@/lib/actions";
import { recordFolder } from "@/lib/files/record-folder";
import { uploadBytes } from "@/lib/files/server-upload";
import { SharePointError, UNREACHABLE } from "@/lib/files/sharepoint";
import { teamKeyOk } from "@/app/team/key";
import { MAX_PHOTO_BYTES, MAX_PHOTOS, PHOTO_ROLE, PHOTO_TABLES, readPhotoTicket, slotKey, sniffImage } from "@/app/team/photos";

// One photo for a team app report, sent after the report saved. Needs the team key and the report's
// photo ticket. Up to 4 photos per report (slots 1 to 4), 4 MB each, images only (checked from the
// file's bytes). The photo goes into the record's own folder (upload_folder_<table>).

const fail = (message: string, status = 400) => Response.json({ ok: false, message }, { status });

export async function POST(req: Request) {
  if (!teamKeyOk(req.headers.get("x-team-key"))) return fail("This link has expired. Ask the office for the team link.", 403);
  const form = await req.formData().catch(() => null);
  const ticket = readPhotoTicket(String(form?.get("ticket") ?? ""));
  if (!ticket) return fail("The report was sent, but its photos took too long. Add them in the office instead.", 403);
  const slot = Number(form?.get("slot"));
  if (!Number.isInteger(slot) || slot < 1 || slot > MAX_PHOTOS) return fail(`A report can have up to ${MAX_PHOTOS} photos.`);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("That photo was empty. Pick it again.");
  if (file.size > MAX_PHOTO_BYTES) return fail("That photo is over 4 MB. Take it again or pick a smaller one.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) return fail("That file isn't a photo. Pick a photo.");

  const sql = db();
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from files
    where entity_table = ${ticket.table} and entity_id = ${ticket.id} and role = ${PHOTO_ROLE} and superseded_by is null`;
  if (n >= MAX_PHOTOS) return fail(`This report already has ${MAX_PHOTOS} photos.`);
  const folder = await recordFolder(ticket.table, ticket.id);
  if (!folder) return fail("The report for this photo no longer exists. Ask the office.");

  const key = slotKey(ticket.key, slot);
  if (!(await claimRequestKey(key, null))) return Response.json({ ok: false, duplicate: true, message: "This photo was already sent." }, { status: 409 });
  try {
    const saved = await uploadBytes({
      folder,
      name: `${PHOTO_TABLES[ticket.table]} ${ticket.id} - photo ${slot}.${kind.ext}`,
      bytes,
      mime: kind.mime,
      entityTable: ticket.table,
      entityId: ticket.id,
      role: PHOTO_ROLE,
      createdBy: ticket.by,
    });
    return Response.json({ ok: true, file: saved });
  } catch (e) {
    // Free the slot so the same photo can be sent again.
    await sql`delete from request_keys where key = ${key}`.catch(() => undefined);
    const message = e instanceof SharePointError && e.status !== 502 ? e.message : UNREACHABLE;
    return fail(message, e instanceof SharePointError ? e.status : 502);
  }
}
