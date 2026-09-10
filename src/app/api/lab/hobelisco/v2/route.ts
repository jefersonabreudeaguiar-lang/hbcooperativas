import { NextResponse } from "next/server";
import { loadHobeliscoV2Flags } from "@lab/hobelisco-hx/config";
import { resolveHobeliscoEnvironment } from "@lab/hobelisco-hx/environment/HobeliscoEnvironment";
import {
  getHobeliscoObserver,
  initHobeliscoObserver,
  runObserverCycle,
} from "@lab/hobelisco-hx/observer/ObserverSingleton";
import { isStagingPersistenceConfigured } from "@lab/hobelisco-hx/persistence/SupabaseStagingPersistence";
import { runHbCoopProbeCycle } from "@/lib/lab/hbCoopReadOnlyProbes";
import {
  assertV2ObserveOnlyServer,
  isHobeliscoV2ObserverEnabledServer,
} from "@/lib/lab/hobeliscoV2Gate";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isHobeliscoV2ObserverEnabledServer()) {
    return NextResponse.json({ error: "V2 observer indisponível" }, { status: 404 });
  }

  const observeOnly = assertV2ObserveOnlyServer();
  const observer = getHobeliscoObserver() ?? (initHobeliscoObserver(), getHobeliscoObserver());
  const flags = loadHobeliscoV2Flags();
  const environment = resolveHobeliscoEnvironment();
  const persistence = observer?.persistence;

  return NextResponse.json({
    version: "HX-0.4.0-v2-hb-coop-observer",
    environment,
    observeOnly: observeOnly.ok,
    running: observer?.isRunning() ?? false,
    flags: {
      v2Enabled: flags.v2Enabled,
      observeOnly: flags.observeOnly,
      stagingEnabled: flags.stagingEnabled,
    },
    persistence: {
      mode: persistence?.mode ?? "none",
      connectionStatus: persistence?.connectionStatus ?? "NOT_CONFIGURED",
      stagingConfigured: isStagingPersistenceConfigured(),
      stats: persistence?.stats() ?? {},
    },
    metrics: observer?.getMetrics() ?? null,
    heartbeat: observer?.isRunning() ? observer.heartbeat() : null,
    principles: {
      mutation: false,
      autoDefense: false,
      humanRequired: true,
      productionObserver: false,
    },
  });
}

export async function POST(request: Request) {
  if (!isHobeliscoV2ObserverEnabledServer()) {
    return NextResponse.json({ error: "V2 observer indisponível" }, { status: 404 });
  }

  initHobeliscoObserver();
  const observer = getHobeliscoObserver();
  if (!observer?.isRunning()) {
    return NextResponse.json({ error: "Observer não iniciado" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    cooperativeIds?: string[];
  };

  const probeCount = await runHbCoopProbeCycle(body.cooperativeIds);
  const cycle = await runObserverCycle();

  return NextResponse.json({
    ok: true,
    sensorCount: cycle.sensorCount,
    probeCount,
    heartbeat: cycle.heartbeat,
    metrics: observer.getMetrics(),
    incidentsRequireHuman: true,
  });
}
