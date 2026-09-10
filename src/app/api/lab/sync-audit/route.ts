import { NextResponse } from "next/server";
import { runSyncAudit } from "@lab/sync-update/scoreAudit";
import { isSyncLabEnabledServer } from "@/lib/lab/syncLabGate";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSyncLabEnabledServer()) {
    return NextResponse.json({ error: "Laboratório sync desativado." }, { status: 404 });
  }

  const report = runSyncAudit();
  return NextResponse.json(report, {
    headers: { "Cache-Control": "no-store" },
  });
}
