import "server-only";
import path from "node:path";

export type StorageMode = "sharepoint" | "local";

// Documents live in SharePoint. "local" keeps files in .local/uploads for development only.
export function storageMode(): StorageMode {
  const m = (process.env.FILE_STORAGE || "local").toLowerCase();
  if (m === "sharepoint") return "sharepoint";
  if (process.env.NODE_ENV === "production" && process.env.VERCEL) {
    throw new Error("FILE_STORAGE must be 'sharepoint' on Vercel");
  }
  return "local";
}

export const LOCAL_DIR = path.join(process.cwd(), ".local", "uploads");

export const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;

// Keeps any file type, but strips characters SharePoint and file systems reject.
export function cleanFileName(name: string): string {
  const base = String(name || "file").split(/[\\/]/).pop() || "file";
  const cleaned = base.replace(/["*:<>?|#%\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
  return (cleaned || "file").slice(0, 180);
}

// Folder for uploads that are not yet tied to a job page (later phases choose job folders).
export function uploadPath(fileName: string, now = new Date()): string {
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `CBS System/Operations/Hub uploads/${month}/${fileName}`;
}
