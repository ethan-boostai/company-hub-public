"use client";

import { Modal } from "./overlay";
import { FileView } from "./file-view";

export type ViewableFile = { id: number; name: string; mime: string; storage?: string; url?: string };

// Documents and photos open in-window on a dark backdrop. "Open full screen" opens the hub's own viewer
// page in a new tab (never a download).
export function DocViewer({ file, onClose }: { file: ViewableFile | null; onClose: () => void }) {
  const full = file ? file.url ?? `/files/${file.id}` : "";
  return (
    <Modal open={!!file} onClose={onClose} title={file ? file.name : "Document"} size="max-w-6xl" dark>
      {file && (
        <div className="flex flex-col h-[85dvh]">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <p className="flex-1 font-semibold truncate" title={file.name}>{file.name}</p>
            <a href={full} target="_blank" rel="noopener" className="px-3 py-1.5 rounded-md border border-line text-sm hover:bg-paper">
              Open full screen
            </a>
            <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md bg-dark text-white text-sm">
              Close
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <FileView key={file.id} fileId={file.id} name={file.name} mime={file.mime} url={file.url} />
          </div>
        </div>
      )}
    </Modal>
  );
}
