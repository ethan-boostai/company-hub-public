import { Suspense } from "react";
import { notFound } from "next/navigation";
import { readDb } from "@/lib/db";
import { FileView } from "@/components/ui/file-view";

// Full-screen viewer for one file, opened in a new tab from the in-window viewer. Signed-in users only
// (the proxy sends everyone else to sign-in).
async function Viewer({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const sql = await readDb();
  const [f] = await sql<{ name: string; mime: string | null }[]>`select name, mime from files where id = ${id}`;
  if (!f) notFound();
  return (
    <div className="h-dvh flex flex-col bg-neutral-900">
      <title>{f.name}</title>
      <div className="flex items-center gap-3 px-4 py-2 bg-dark text-white">
        <p className="flex-1 font-semibold truncate" title={f.name}>{f.name}</p>
        <a href={`/api/files/${id}/content?download=1`} className="px-3 py-1.5 rounded-md border border-white/40 text-sm hover:bg-white/10">
          Download file
        </a>
      </div>
      <div className="flex-1 min-h-0">
        <FileView fileId={Number(id)} name={f.name} mime={f.mime || ""} />
      </div>
    </div>
  );
}

export default function FilePage(props: PageProps<"/files/[id]">) {
  return (
    <Suspense fallback={<div className="h-dvh bg-neutral-900" />}>
      <Viewer params={props.params} />
    </Suspense>
  );
}
