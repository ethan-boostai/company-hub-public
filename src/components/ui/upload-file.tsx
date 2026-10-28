"use client";

import { useRef, useState } from "react";

export type UploadedFile = { id: number; name: string; mime: string; size: number };

const CHUNK = 5 * 1024 * 1024; // multiple of 320 KiB, as SharePoint requires

async function json<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({ ok: false, message: "Unexpected reply from the server." }))) as T;
}

// SharePoint upload session: send the file in chunks straight to Microsoft (no size limit from Vercel).
async function sendToSharePoint(url: string, file: File, onProgress: (p: number) => void): Promise<string> {
  let item: { id?: string } = {};
  for (let start = 0; start < file.size; start += CHUNK) {
    const end = Math.min(start + CHUNK, file.size);
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Range": `bytes ${start}-${end - 1}/${file.size}` },
      body: file.slice(start, end),
    });
    if (!res.ok) throw new Error("upload");
    if (res.status === 200 || res.status === 201) item = await res.json();
    onProgress(end / file.size);
  }
  if (!item.id) throw new Error("upload");
  return item.id;
}

// "Upload file": any file type. Records the file against what it belongs to.
export function UploadFile({
  entityTable,
  entityId,
  jobId,
  role,
  label = "Upload file",
  onUploaded,
}: {
  entityTable?: string;
  entityId?: number;
  jobId?: number;
  role?: string;
  label?: string;
  onUploaded: (file: UploadedFile) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setBusy(true);
    setError("");
    setProgress(0);
    try {
      const start = await json<{ ok: boolean; message?: string; mode?: string; uploadUrl?: string; ticket?: string }>(
        await fetch("/api/files/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: file.name, size: file.size, mime: file.type, entityTable: entityTable ?? null,
            entityId: entityId ?? null, jobId: jobId ?? null, role: role ?? null, requestKey: crypto.randomUUID(),
          }),
        }),
      );
      if (!start.ok || !start.uploadUrl || !start.ticket) throw new Error(start.message || "upload");

      let itemId: string | undefined;
      if (start.mode === "sharepoint") {
        itemId = await sendToSharePoint(start.uploadUrl, file, setProgress);
      } else {
        const put = await json<{ ok: boolean; message?: string }>(await fetch(start.uploadUrl, { method: "PUT", body: file }));
        if (!put.ok) throw new Error(put.message || "upload");
        setProgress(1);
      }

      const done = await json<{ ok: boolean; message?: string; file?: UploadedFile }>(
        await fetch("/api/files/finish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticket: start.ticket, itemId }),
        }),
      );
      if (!done.ok || !done.file) throw new Error(done.message || "upload");
      onUploaded(done.file);
    } catch (e) {
      const msg = e instanceof Error && e.message !== "upload" ? e.message : "The upload didn't finish. Check the connection and try again.";
      setError(msg);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <input
        ref={input}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="px-4 py-2 rounded-lg border border-dark font-semibold hover:bg-paper disabled:opacity-60"
      >
        {busy ? `Uploading… ${Math.round(progress * 100)}%` : label}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
