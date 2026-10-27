import { NextResponse } from "next/server";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Release oficial servido por esta instância (sem auth — metadados públicos). */
export async function GET() {
  const deploymentId = (process.env.VERCEL_DEPLOYMENT_ID ?? "").trim();
  const gitCommitSha = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").trim();

  const fingerprint = `${APP_BUILD_VERSION}:${gitCommitSha.slice(0, 12)}:${deploymentId}`;

  const v2Raw = (process.env.NEXT_PUBLIC_V2_HB_ONLY ?? "").trim().toLowerCase();
  const v2HbOnly = v2Raw === "1" || v2Raw === "true" || v2Raw === "yes";

  return NextResponse.json(
    {
      build: APP_BUILD_VERSION,
      deploymentId,
      gitCommitSha,
      fingerprint,
      v2HbOnly,
      appUrl: (process.env.NEXT_PUBLIC_APP_URL ?? "https://hbcooperativas.vercel.app").trim(),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "CDN-Cache-Control": "no-store",
        Pragma: "no-cache",
        "x-hb-deployment-id": deploymentId,
        "x-hb-app-build": String(APP_BUILD_VERSION),
        "x-hb-release-fingerprint": fingerprint,
      },
    }
  );
}
