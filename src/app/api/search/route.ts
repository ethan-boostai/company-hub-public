import { connection } from "next/server";
import { getCurrentPerson } from "@/lib/auth/session";
import { searchHub } from "@/lib/search";

// Results for the header search box as you type. Signed-in office users only.
export async function GET(req: Request) {
  await connection();
  if (!(await getCurrentPerson())) return Response.json({ error: "Sign in again." }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") || "";
  return Response.json(await searchHub(q, 6), { headers: { "Cache-Control": "no-store" } });
}
