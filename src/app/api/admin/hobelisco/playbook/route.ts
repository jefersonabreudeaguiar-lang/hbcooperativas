import { NextResponse } from "next/server";
import type { HobeliscoIncidentV2 } from "@lab/hobelisco-hx/observation/types";
import {
  getHobeliscoObserver,
  initHobeliscoObserver,
} from "@lab/hobelisco-hx/observer/ObserverSingleton";
import { requireAdminRole, requireApiAuth } from "@/lib/security/apiGuard";
import { resolvePlaybookForIncident } from "@/lib/lab/hobeliscoPlaybooks";
import { getCreditWatchRepository } from "@/lib/lab/hbCreditWatch/repository";
import type { IncidentOutcomeType } from "@/lib/lab/hbCreditWatch/types";
import { isHobeliscoV2ObserverEnabledServer } from "@/lib/lab/hobeliscoV2Gate";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;
  const adminDenied = requireAdminRole(auth.session, auth.enforced);
  if (adminDenied) return adminDenied;

  const url = new URL(request.url);
  const incidentId = url.searchParams.get("incidentId");
  if (!incidentId) {
    return NextResponse.json({ error: "incidentId required" }, { status: 400 });
  }

  if (!isHobeliscoV2ObserverEnabledServer()) {
    return NextResponse.json({ error: "V2 indisponível" }, { status: 404 });
  }

  initHobeliscoObserver();
  const observer = getHobeliscoObserver();
  const incident = observer ? await observer.persistence.getIncident(incidentId) : null;
  if (!incident) return NextResponse.json({ error: "incident not found" }, { status: 404 });

  if (incident.status !== "CONFIRMED") {
    return NextResponse.json({ playbook: null, reason: "only_after_confirmed" });
  }

  const playbook = resolvePlaybookForIncident(incident.context);
  const repo = getCreditWatchRepository();
  const outcome = repo.getOutcome(incidentId);

  if (playbook && observer) {
    await observer.persistence.saveAuditEvent({
      id: `playbook_view_${incidentId}_${Date.now()}`,
      kind: "playbook_viewed",
      payload: { incidentId, playbookId: playbook.id, actorId: auth.session?.sub ?? "admin" },
      eventHash: "",
      previousEventHash: null,
      at: new Date().toISOString(),
    });
  }

  return NextResponse.json({ playbook, outcome, humanExecutionRequired: true });
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
    incidentId: string;
    outcome: IncidentOutcomeType;
    notes?: string;
  };

  const incident = await observer.persistence.getIncident(body.incidentId);
  if (!incident) return NextResponse.json({ error: "incident not found" }, { status: 404 });
  if (incident.status !== "CONFIRMED") {
    return NextResponse.json({ error: "outcome only after CONFIRMED" }, { status: 400 });
  }

  const repo = getCreditWatchRepository();
  const record = {
    id: `outcome_${body.incidentId}_${Date.now()}`,
    incidentId: body.incidentId,
    outcome: body.outcome,
    notes: body.notes?.trim() ?? null,
    actorId: auth.session?.sub ?? null,
    createdAt: new Date().toISOString(),
  };
  repo.saveOutcome(record);

  await observer.persistence.saveAuditEvent({
    id: record.id,
    kind: "outcome_recorded",
    payload: {
      incidentId: body.incidentId,
      outcome: body.outcome,
      actorId: record.actorId,
      learning: "PROPOSED",
    },
    eventHash: "",
    previousEventHash: null,
    at: record.createdAt,
  });

  await observer.persistence.saveLearningInsight({
    id: `learn_${record.id}`,
    hypothesis: `Outcome ${body.outcome} for ${incident.context.eventType ?? "incident"}`,
    state: "PROPOSED",
    cooperativeId: incident.cooperativeId,
    at: record.createdAt,
    schemaVersion: "2.0",
    environment: incident.environment,
  });

  return NextResponse.json({ ok: true, outcome: record, learning: "PROPOSED" });
}
