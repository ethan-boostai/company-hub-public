import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/token";

// Quick check only: no session cookie means go to sign-in. The team app, the yard app and the job crew pages
// (/crew/<job>?t=…) have no sign-in; they check their own link key. Pages and API routes still check the
// session properly on the server.
export function proxy(req: NextRequest) {
  if (req.cookies.get(SESSION_COOKIE)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, message: "Sign in again." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/sign-in";
  url.search = "";
  const next = req.nextUrl.pathname + req.nextUrl.search;
  if (next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!sign-in|api/health|team$|team/|api/team/|crew/|api/crew/|yard$|yard/|api/yard$|api/yard/|_next/|favicon.ico|cbs-logo.png).*)"],
};
