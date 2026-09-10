import { NextResponse } from "next/server";
import type { HobeliscoIngestPayload } from "@/lib/lab/hobeliscoAutoObserver";
import { ingestHobeliscoObservation } from "@/lib/lab/hobeliscoAutoObserver";
import { isHobeliscoV2ObserverEnabledServer } from "@/lib/lab/hobeliscoV2Gate";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isHobeliscoV2ObserverEnabledServer()) {
    return NextResponse.json({ ok: false, reason: "disabled" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as HobeliscoIngestPayload;
  if (!body.endpoint || !body.type) {
    return NextResponse.json({ ok: false, reason: "invalid_payload" }, { status: 400 });
  }

  await ingestHobeliscoObservation(body);
  return NextResponse.json({ ok: true });
}
