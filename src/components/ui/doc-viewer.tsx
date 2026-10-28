"use client";

import { Modal } from "./overlay";

export type ViewableFile = { id: number; name: string; mime: string; url?: string };

function kind(f: ViewableFile): "image" | "frame" | "other" {
  const m = (f.mime || "").toLowerCase();
  const ext = f.name.toLowerCase().split(".").pop() || "";
  if (m.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(ext)) return "image";
  if (m === "application/pdf" || m.startsWith("text/") || ["pdf", "txt"].includes(ext)) return "frame";
  return "other";
}

// Documents and photos open in-window on a dark backdrop, with "Open full screen" in a new tab.
export function DocViewer({ file, onClose }: { file: ViewableFile | null; onClose: () => void }) {
  const url = file ? file.url ?? `/api/files/${file.id}/content` : "";
  return (
    <Modal open={!!file} onClose={onClose} title={file ? file.name : "Document"} size="max-w-6xl" dark>
      {file && (
        <div className="flex flex-col h-[85dvh]">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <p className="flex-1 font-semibold truncate" title={file.name}>{file.name}</p>
            <a href={url} target="_blank" rel="noopener" className="px-3 py-1.5 rounded-md border border-line text-sm hover:bg-paper">
              Open full screen
            </a>
            <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md bg-dark text-white text-sm">
              Close
            </button>
          </div>
          <div className="flex-1 min-h-0 bg-neutral-900 flex items-center justify-center">
            {kind(file) === "image" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={file.name} className="max-h-full max-w-full object-contain" />
            )}
            {kind(file) === "frame" && <iframe src={url} title={file.name} className="w-full h-full bg-white" />}
            {kind(file) === "other" && (
              <div className="text-center text-white p-6">
                <p className="mb-4">This file type can&apos;t be previewed here.</p>
                <a href={file.url ? url : `${url}?download=1`} className="px-4 py-2 rounded-lg bg-brand text-white font-semibold">Download file</a>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
