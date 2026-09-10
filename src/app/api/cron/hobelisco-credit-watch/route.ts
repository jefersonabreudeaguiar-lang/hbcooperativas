import { NextResponse } from "next/server";
import { isCreditWatchEnabled, runHbCreditWatch } from "@/lib/lab/hbCreditWatch";

function authorizeCron(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${cronSecret}`;
}

export const dynamic = "force-dynamic";

/** Scheduler externo — dispara HB Credit Watch (fail-closed se flag OFF) */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  if (!isCreditWatchEnabled()) {
    return NextResponse.json({ ok: false, skipped: "HB_HOBELISCO_CREDIT_WATCH_ENABLED=false" });
  }

  const result = await runHbCreditWatch();
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  return GET(request);
}
