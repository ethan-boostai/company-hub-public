import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/token";

// Quick check only: no session cookie means go to sign-in. Pages and API routes still check the
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
  matcher: ["/((?!sign-in|api/health|_next/|favicon.ico|cbs-logo.png).*)"],
};
