import { NextResponse } from "next/server";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Release oficial servido por esta instância (sem auth — metadados públicos). */
export async function GET() {
  const deploymentId = (process.env.VERCEL_DEPLOYMENT_ID ?? "").trim();
  const gitCommitSha = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").trim();

  const fingerprint = `${APP_BUILD_VERSION}:${gitCommitSha.slice(0, 12)}:${deploymentId}`;

  return NextResponse.json(
    {
      build: APP_BUILD_VERSION,
      deploymentId,
      gitCommitSha,
      fingerprint,
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
