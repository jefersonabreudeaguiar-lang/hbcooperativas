import { NextResponse } from "next/server";
import type { HobeliscoIncidentV2 } from "@lab/hobelisco-hx/observation/types";
import { CorrelationEngine } from "@lab/hobelisco-hx/observation/CorrelationEngine";
import {
  getHobeliscoObserver,
  initHobeliscoObserver,
} from "@lab/hobelisco-hx/observer/ObserverSingleton";
import { requireAdminRole, requireApiAuth } from "@/lib/security/apiGuard";
import { isHobeliscoV2ObserverEnabledServer } from "@/lib/lab/hobeliscoV2Gate";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;
  const adminDenied = requireAdminRole(auth.session, auth.enforced);
  if (adminDenied) return adminDenied;

  if (!isHobeliscoV2ObserverEnabledServer()) {
    return NextResponse.json({ incidents: [], enabled: false, humanRequired: true });
  }

  initHobeliscoObserver();
  const observer = getHobeliscoObserver();
  if (!observer) return NextResponse.json({ incidents: [], enabled: true, humanRequired: true });

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const incidents = await observer.persistence.listIncidents({ status, limit: 40 });
  const actorId = auth.session?.sub ?? "admin";

  return NextResponse.json({
    incidents,
    enabled: true,
    humanRequired: true,
    autoConfirm: false,
    actor: actorId,
  });
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;
  const adminDenied = requireAdminRole(auth.session, auth.enforced);
  if (adminDenied) return adminDenied;

  if (!isHobeliscoV2ObserverEnabledServer()) {
    return NextResponse.json({ error: "V2 indisponível" }, { status: 404 });
  }

  initHobeliscoObserver();
  const observer = getHobeliscoObserver();
  if (!observer) return NextResponse.json({ error: "observer offline" }, { status: 503 });

  const body = (await request.json()) as {
    action: "confirm" | "dismiss";
    incidentId: string;
  };

  const existing = await observer.persistence.getIncident(body.incidentId);
  if (!existing) {
    return NextResponse.json({ error: "incident not found" }, { status: 404 });
  }

  const correlation = new CorrelationEngine();
  let updated: HobeliscoIncidentV2;

  if (body.action === "confirm") {
    const confirmed = correlation.confirmIncident(existing, {
      minSignals: 1,
      minConfidence: 0.1,
      humanAck: true,
    });
    if (!confirmed) {
      return NextResponse.json({ error: "confirm criteria not met" }, { status: 400 });
    }
    updated = confirmed;
  } else {
    updated = {
      ...existing,
      status: "DISMISSED",
      updatedAt: new Date().toISOString(),
    };
  }

  await observer.persistence.saveIncident(updated);
  const actorId = auth.session?.sub ?? "admin";
  const actorEmail = auth.session?.email ?? null;
  await observer.persistence.saveAuditEvent({
    id: `admin_${body.action}_${body.incidentId}_${Date.now()}`,
    kind: `incident_${body.action}`,
    payload: {
      incidentId: body.incidentId,
      actorId,
      actorEmail,
      humanAck: body.action === "confirm",
    },
    eventHash: "",
    previousEventHash: null,
    at: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    incident: updated,
    humanAck: body.action === "confirm",
    actor: actorId,
  });
}
