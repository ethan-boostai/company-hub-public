"use client";

import { useState } from "react";
import { Modal } from "./overlay";

// storage "sharepoint": opened through SharePoint's own viewer, which also shows Office files and drawings.
export type ViewableFile = { id: number; name: string; mime: string; storage?: string; url?: string };

function kind(f: ViewableFile): "image" | "frame" | "other" {
  const m = (f.mime || "").toLowerCase();
  const ext = f.name.toLowerCase().split(".").pop() || "";
  if (m.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "image";
  if (f.storage === "sharepoint" || m === "application/pdf" || m.startsWith("text/") || ["pdf", "txt"].includes(ext)) return "frame";
  return "other";
}

function urls(f: ViewableFile) {
  if (f.url) return { show: f.url, full: f.url, download: f.url };
  const content = `/api/files/${f.id}/content`;
  const show = f.storage === "sharepoint" && kind(f) === "frame" ? `${content}?view=1` : content;
  return { show, full: show, download: `${content}?download=1` };
}

// Documents and photos open in-window on a dark backdrop, with "Open full screen" in a new tab.
export function DocViewer({ file, onClose }: { file: ViewableFile | null; onClose: () => void }) {
  return (
    <Modal open={!!file} onClose={onClose} title={file ? file.name : "Document"} size="max-w-6xl" dark>
      {file && <ViewerBody key={file.id} file={file} onClose={onClose} />}
    </Modal>
  );
}

function ViewerBody({ file, onClose }: { file: ViewableFile; onClose: () => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  const u = urls(file);
  const k = kind(file);
  return (
    <div className="flex flex-col h-[85dvh]">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <p className="flex-1 font-semibold truncate" title={file.name}>{file.name}</p>
        <a href={u.full} target="_blank" rel="noopener" className="px-3 py-1.5 rounded-md border border-line text-sm hover:bg-paper">
          Open full screen
        </a>
        <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md bg-dark text-white text-sm">
          Close
        </button>
      </div>
      <div className="flex-1 min-h-0 bg-neutral-900 flex items-center justify-center">
        {k === "image" && !imageFailed && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={u.show} alt={file.name} onError={() => setImageFailed(true)} className="max-h-full max-w-full object-contain" />
        )}
        {k === "image" && imageFailed && (
          <p role="alert" className="text-white p-6 text-center">
            This picture couldn&apos;t be loaded. {file.storage === "sharepoint" ? "SharePoint isn't reachable right now. Try again shortly." : ""}
          </p>
        )}
        {k === "frame" && <iframe src={u.show} title={file.name} className="w-full h-full bg-white" />}
        {k === "other" && (
          <div className="text-center text-white p-6">
            <p className="mb-4">This file type can&apos;t be previewed here.</p>
            <a href={u.download} className="px-4 py-2 rounded-lg bg-brand text-white font-semibold">Download file</a>
          </div>
        )}
      </div>
    </div>
  );
}
