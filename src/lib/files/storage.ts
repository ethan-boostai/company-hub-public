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

// SharePoint folder for uploads. Phase 0 uses the test folder only; job folders come with Phase 1.
export const UPLOAD_FOLDER = "CBS System/Hub uploads/Test";

// Only the live site (Vercel production) may put files in real folders. Previews, local development
// and tests always upload into the test folder, whatever folder was asked for (Ethan, 28/10/2026).
export function uploadFolderFor(folder: string, env: Record<string, string | undefined> = process.env): string {
  return env.VERCEL === "1" && env.VERCEL_ENV === "production" ? folder : UPLOAD_FOLDER;
}
