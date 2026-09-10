import { NextResponse } from "next/server";
import {
  getHobeliscoObserver,
  initHobeliscoObserver,
} from "@lab/hobelisco-hx/observer/ObserverSingleton";
import { resolvePlaybookForIncident } from "@/lib/lab/hobeliscoPlaybooks";
import { getCreditWatchRepository } from "@/lib/lab/hbCreditWatch/repository";
import type { IncidentOutcomeType } from "@/lib/lab/hbCreditWatch/types";
import { isHobeliscoV2ObserverEnabledServer } from "@/lib/lab/hobeliscoV2Gate";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isHobeliscoV2ObserverEnabledServer()) {
    return NextResponse.json({ error: "V2 indisponível" }, { status: 404 });
  }

  const url = new URL(request.url);
  const incidentId = url.searchParams.get("incidentId");
  if (!incidentId) return NextResponse.json({ error: "incidentId required" }, { status: 400 });

  initHobeliscoObserver();
  const observer = getHobeliscoObserver();
  const incident = observer ? await observer.persistence.getIncident(incidentId) : null;
  if (!incident) return NextResponse.json({ error: "incident not found" }, { status: 404 });
  if (incident.status !== "CONFIRMED") {
    return NextResponse.json({ playbook: null, reason: "only_after_confirmed" });
  }

  const playbook = resolvePlaybookForIncident(incident.context);
  const outcome = getCreditWatchRepository().getOutcome(incidentId);
  return NextResponse.json({ playbook, outcome, humanExecutionRequired: true });
}

export async function POST(request: Request) {
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

  const record = {
    id: `outcome_${body.incidentId}_${Date.now()}`,
    incidentId: body.incidentId,
    outcome: body.outcome,
    notes: body.notes?.trim() ?? null,
    actorId: "lab",
    createdAt: new Date().toISOString(),
  };
  getCreditWatchRepository().saveOutcome(record);

  await observer.persistence.saveAuditEvent({
    id: record.id,
    kind: "outcome_recorded",
    payload: { incidentId: body.incidentId, outcome: body.outcome, learning: "PROPOSED" },
    eventHash: "",
    previousEventHash: null,
    at: record.createdAt,
  });

  return NextResponse.json({ ok: true, outcome: record, learning: "PROPOSED" });
}
