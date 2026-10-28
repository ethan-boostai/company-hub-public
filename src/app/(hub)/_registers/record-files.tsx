"use client";

import { useEffect, useState } from "react";
import { DocViewer, type ViewableFile } from "@/components/ui/doc-viewer";
import { UploadFile } from "@/components/ui/upload-file";
import { listRecordFiles, type RecordFile } from "./files-actions";
import { niceDateTime } from "./dates";

// Files on one register record: list, open in-window, and "Upload file" (any type).
export function RecordFiles({ entityTable, entityId, title = "Files" }: { entityTable: string; entityId: number; title?: string }) {
  const [files, setFiles] = useState<RecordFile[] | null>(null);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState<ViewableFile | null>(null);

  useEffect(() => {
    let live = true;
    listRecordFiles(entityTable, entityId)
      .then((r) => {
        if (!live) return;
        if (r.ok) setFiles(r.data ?? []);
        else setError(r.message);
      })
      .catch(() => live && setError("Couldn't load the files. Refresh to try again."));
    return () => {
      live = false;
    };
  }, [entityTable, entityId]);

  return (
    <section className="mt-6 border-t border-line pt-4">
      <div className="flex items-center gap-3 mb-2">
        <h3 className="font-semibold flex-1">{title}</h3>
        <UploadFile
          entityTable={entityTable}
          entityId={entityId}
          onUploaded={(f) => setFiles((list) => [{ ...f, by: "", at: new Date().toISOString() }, ...(list ?? [])])}
        />
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {!files && !error && <p className="text-sm text-muted">Loading files…</p>}
      {files && files.length === 0 && <p className="text-sm text-muted">No files yet.</p>}
      {files && files.length > 0 && (
        <ul className="divide-y divide-line border border-line rounded-lg">
          {files.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => setViewing(f)} className="w-full text-left px-3 py-2 hover:bg-paper">
                <span className="block text-sm font-medium truncate">{f.name}</span>
                <span className="block text-xs text-muted">{[f.by, niceDateTime(f.at)].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <DocViewer file={viewing} onClose={() => setViewing(null)} />
    </section>
  );
}
