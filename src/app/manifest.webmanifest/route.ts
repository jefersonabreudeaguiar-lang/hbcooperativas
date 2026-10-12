import { NextResponse } from "next/server";
import { buildWebAppManifest } from "@/lib/pwa/webAppManifest";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Substitui manifest estático — start_url/scope absolutos na origem real (Vercel / domínio custom). */
export async function GET(request: Request) {
  const manifest = buildWebAppManifest(request);
  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "CDN-Cache-Control": "no-store",
    },
  });
}
