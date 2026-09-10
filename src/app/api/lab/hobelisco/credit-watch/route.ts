import { NextResponse } from "next/server";
import { isCreditWatchEnabled, runHbCreditWatch } from "@/lib/lab/hbCreditWatch";
import { isHobeliscoV2ObserverEnabledServer } from "@/lib/lab/hobeliscoV2Gate";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!isHobeliscoV2ObserverEnabledServer()) {
    return NextResponse.json({ error: "V2 indisponível" }, { status: 404 });
  }
  if (!isCreditWatchEnabled()) {
    return NextResponse.json({ ok: false, skipped: "credit_watch_disabled" }, { status: 403 });
  }
  const result = await runHbCreditWatch();
  return NextResponse.json(result);
}
