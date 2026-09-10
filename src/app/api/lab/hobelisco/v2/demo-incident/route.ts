import { NextResponse } from "next/server";
import { seedHobeliscoDemoIncident } from "@/lib/lab/seedHobeliscoDemoIncident";
import { isHobeliscoV2ObserverEnabledServer } from "@/lib/lab/hobeliscoV2Gate";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!isHobeliscoV2ObserverEnabledServer()) {
    return NextResponse.json({ error: "V2 indisponível" }, { status: 404 });
  }

  const result = await seedHobeliscoDemoIncident();
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "falha" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, incidentId: result.incidentId, demo: true });
}
