"use client";

import { useEffect, useState } from "react";
import type { FileLinks } from "@/app/api/files/[id]/link/route";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp"];
const IMAGE_EXT = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];

// Pictures a browser can show itself. Others (HEIC, drawings, Office files, PDFs) use SharePoint's viewer.
export function isPicture(name: string, mime: string): boolean {
  const ext = name.toLowerCase().split(".").pop() || "";
  return IMAGE_TYPES.includes((mime || "").toLowerCase()) || IMAGE_EXT.includes(ext);
}
function opensInBrowser(name: string, mime: string): boolean {
  const ext = name.toLowerCase().split(".").pop() || "";
  const m = (mime || "").toLowerCase();
  return m === "application/pdf" || m.startsWith("text/") || ["pdf", "txt"].includes(ext);
}

type View =
  | { mode: "loading" }
  | { mode: "picture"; src: string }
  | { mode: "frame"; src: string }
  | { mode: "none"; downloadUrl: string }
  | { mode: "error"; message: string };

// Shows one file: pictures directly, everything else in SharePoint's own viewer (or the browser's, for
// local test files). Never sends the viewer to a download link. `url` is for files that aren't in the
// files table (e.g. the sample PDF).
export function FileView({ fileId, name, mime, url }: { fileId: number; name: string; mime: string; url?: string }) {
  const [view, setView] = useState<View>({ mode: "loading" });

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    const set = (v: View) => !cancelled && setView(v);
    (async () => {
      if (url) {
        set(isPicture(name, mime) ? { mode: "picture", src: url } : { mode: "frame", src: url });
        return;
      }
      const res = await fetch(`/api/files/${fileId}/link`, { cache: "no-store" }).catch(() => null);
      const links = (await res?.json().catch(() => null)) as (FileLinks | { ok: false; message?: string }) | null;
      if (!links || !links.ok) {
        set({ mode: "error", message: links?.message || "SharePoint isn't reachable right now. Try again shortly." });
        return;
      }
      if (isPicture(links.name, links.mime) && links.fileUrl) {
        if (links.storage !== "sharepoint") return set({ mode: "picture", src: links.fileUrl });
        // SharePoint's file link always downloads, so fetch the picture and show it from memory.
        const pic = await fetch(links.fileUrl).then((r) => (r.ok ? r.blob() : null)).catch(() => null);
        if (pic) {
          objectUrl = URL.createObjectURL(pic);
          if (cancelled) URL.revokeObjectURL(objectUrl);
          return set({ mode: "picture", src: objectUrl });
        }
        if (links.previewUrl) return set({ mode: "frame", src: links.previewUrl });
        return set({ mode: "error", message: "SharePoint isn't reachable right now. Try again shortly." });
      }
      if (links.previewUrl) return set({ mode: "frame", src: links.previewUrl });
      if (links.storage !== "sharepoint" && links.fileUrl && opensInBrowser(links.name, links.mime)) {
        return set({ mode: "frame", src: links.fileUrl });
      }
      set({ mode: "none", downloadUrl: links.downloadUrl });
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId, name, mime, url]);

  return (
    <div className="w-full h-full bg-neutral-900 flex items-center justify-center" data-file-view={view.mode}>
      {view.mode === "loading" && <p className="text-white/80">Opening {name}…</p>}
      {view.mode === "picture" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={view.src}
          alt={name}
          onError={() => setView({ mode: "error", message: "This picture couldn't be loaded." })}
          className="max-h-full max-w-full object-contain"
        />
      )}
      {view.mode === "frame" && <iframe src={view.src} title={name} className="w-full h-full bg-white border-0" allowFullScreen />}
      {view.mode === "none" && (
        <div className="text-center text-white p-6">
          <p className="mb-4">This file type can&apos;t be previewed here.</p>
          <a href={view.downloadUrl} className="px-4 py-2 rounded-lg bg-brand text-white font-semibold">Download file</a>
        </div>
      )}
      {view.mode === "error" && <p role="alert" className="text-white p-6 text-center">{view.message}</p>}
    </div>
  );
}
