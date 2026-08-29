import { NextResponse } from "next/server";
import { buildClearSessionCookieHeader } from "@/lib/security/sessionCookie";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.headers.append("Set-Cookie", buildClearSessionCookieHeader());
  return response;
}
