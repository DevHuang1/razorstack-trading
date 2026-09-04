import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export const config = {
  matcher: ["/home/:path*", "/login"],
};

export async function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const role = await verifySessionToken(process.env.AUTH_SESSION_SECRET ?? "", token);
  const isLoginPage = url.pathname === "/login";

  if (role && isLoginPage) {
    url.pathname = "/home/research";
    return NextResponse.redirect(url);
  }

  if (!role && !isLoginPage) {
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}