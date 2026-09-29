import { NextResponse } from "next/server";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

/** Release oficial servido por esta instância (sem auth — metadados públicos). */
export async function GET() {
  const deploymentId = (process.env.VERCEL_DEPLOYMENT_ID ?? "").trim();
  const gitCommitSha = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").trim();

  return NextResponse.json(
    {
      build: APP_BUILD_VERSION,
      deploymentId,
      gitCommitSha,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
      },
    }
  );
}
