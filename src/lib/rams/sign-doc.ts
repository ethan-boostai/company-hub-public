import "server-only";
import { registerSignDoc, DEFAULT_ACCEPT, type SignDoc } from "@/lib/signons/docs";
import { taskFolder } from "@/lib/requirements";
import { ramsQuery, type RamsRow } from "./data";
import { ramsNo } from "./content";

function toDoc(r: RamsRow): SignDoc {
  return {
    type: "rams", table: "rams", id: r.id, jobId: r.jobId, jobNo: r.jobNo, revision: r.revision,
    label: `RAMS ${ramsNo(r.jobNo, r.seq)} rev ${r.revision}: ${r.title}`,
    issuedFileId: r.fileId, issuedFileName: r.fileName || `RAMS ${ramsNo(r.jobNo, r.seq)} rev ${r.revision}.pdf`,
    folder: taskFolder(r.jobNo, "rams"), signedFileId: r.signedFileId,
    signable: r.kind === "cbs" && r.status === "issued" && !!r.fileId,
    acceptText: "I have read and understood this RAMS (risk assessment and method statement), and I will follow it. If anything changes on site I will stop and tell my supervisor.",
  };
}

// CBS RAMS are signed by everyone working to them: the current issued revision only.
registerSignDoc("rams", {
  load: async (sql, id) => {
    const [r] = await ramsQuery(sql, { id });
    return r ? toDoc(r) : null;
  },
  openForJob: async (sql, jobId) => (await ramsQuery(sql, { jobId })).map(toDoc).filter((d) => d.signable),
  setSignedFile: async (sql, id, fileId) => {
    await sql`update rams set signed_file_id = ${fileId} where id = ${id}`;
  },
});

export { DEFAULT_ACCEPT };
