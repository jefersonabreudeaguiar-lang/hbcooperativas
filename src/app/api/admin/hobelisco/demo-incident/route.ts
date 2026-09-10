import { NextResponse } from "next/server";
import { requireAdminRole, requireApiAuth } from "@/lib/security/apiGuard";
import { seedHobeliscoDemoIncident } from "@/lib/lab/seedHobeliscoDemoIncident";
import { isHobeliscoV2ObserverEnabledServer } from "@/lib/lab/hobeliscoV2Gate";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;
  const adminDenied = requireAdminRole(auth.session, auth.enforced);
  if (adminDenied) return adminDenied;

  if (!isHobeliscoV2ObserverEnabledServer()) {
    return NextResponse.json({ error: "V2 indisponível" }, { status: 404 });
  }

  const result = await seedHobeliscoDemoIncident();
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "falha" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, incidentId: result.incidentId, demo: true });
}
