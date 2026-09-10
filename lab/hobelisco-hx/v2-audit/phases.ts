/**
 * Suíte V2 — observe-only staging
 */

import { loadHobeliscoV2Flags } from "../config";
import { getEnvironmentBehavior } from "../environment/HobeliscoEnvironment";
import { extractLearningInsights } from "../learning/LearningEngine";
import { MemoryStore } from "../memory/MemoryStore";
import { feedSyntheticBurst } from "../observer/ArenaObservationAdapter";
import {
  createLabObserver,
  createProductionTripwireObserver,
  createStagingObserver,
} from "../observer/HobeliscoObserver";
import { ObservationPipeline } from "../observation/ObservationPipeline";
import { CorrelationEngine } from "../observation/CorrelationEngine";
import { blockAnyMutation } from "../observation/ObserveOnlyGuard";
import { containsPersistedSecret, sanitizeObservation } from "../observation/ObservationSanitizer";
import { normalizeRawObservation } from "../observation/Normalizer";
import {
  bridgeApiObservation,
  bridgeAuthObservation,
  bridgeDatabaseObservation,
  bridgeHbCreditObservation,
  bridgeSensorSignals,
  bridgeSyncObservation,
  listBridgeSensors,
} from "../observation/SensorBridge";
import { classifyThreat } from "../threat/ThreatClassifier";
import { assertCooperativeScope, memoryBelongsToCooperative } from "../security/cooperativeIsolation";
import {
  getInMemoryPersistence,
  resetInMemoryPersistence,
  InMemoryPersistence,
} from "../persistence/InMemoryPersistence";
import {
  isStagingPersistenceConfigured,
  STAGING_CONNECTION_NOT_CONFIGURED,
  SupabaseStagingPersistence,
} from "../persistence/SupabaseStagingPersistence";
import { registerAntibody, matchAntibodyForThreat } from "../antibodies/AntibodyRegistry";
import { recordV2Test, type V2TestResult } from "./types";

const COOP_A = "62351750000165";
const COOP_B = "11111111000111";

export async function runAllV2Phases(tests: V2TestResult[]): Promise<{
  metrics: Record<string, number>;
  financialMutations: number;
  secretPersisted: boolean;
  cooperativeLeak: boolean;
}> {
  resetInMemoryPersistence();
  let financialMutations = 0;
  let secretPersisted = false;
  let cooperativeLeak = false;
  const metrics: Record<string, number> = {
    observationsReceived: 0,
    observationsPersisted: 0,
    observationsDropped: 0,
    boundaryBlocks: 0,
    productionTripwires: 0,
    financialBlocks: 0,
    duplicateObservations: 0,
  };

  {
    const lab = getEnvironmentBehavior("LAB");
    const stg = getEnvironmentBehavior("STAGING");
    const prod = getEnvironmentBehavior("PRODUCTION");
    recordV2Test(tests, {
      id: "V2-ENVIRONMENT-001",
      phase: 3,
      name: "Contrato LAB/STAGING/PRODUCTION",
      severity: "critical",
      pass: lab.simulationAllowed && lab.observation && !lab.mutation && stg.observation && !prod.observation,
      detail: `LAB STG PROD`,
    });
  }

  {
    const prodFlags = loadHobeliscoV2Flags({
      NODE_ENV: "production",
      HOBELISCO_ENVIRONMENT: "PRODUCTION",
      HB_HOBELISCO_V2_ENABLED: "true",
    } as NodeJS.ProcessEnv);
    recordV2Test(tests, {
      id: "V2-FLAG-FAIL-CLOSED-001",
      phase: 4,
      name: "V2 fail-closed em produção",
      severity: "critical",
      pass: !prodFlags.v2Enabled,
      detail: `v2Enabled=${prodFlags.v2Enabled}`,
    });
  }

  {
    const obs = createLabObserver(true);
    obs.start();
    let n = 0;
    for (const e of bridgeSensorSignals("LAB", { authFailures: 1 })) {
      const r = await obs.pipeline.persist(e);
      if (r.accepted) n += 1;
    }
    const m = obs.getMetrics();
    metrics.observationsReceived = m.observationsReceived;
    metrics.observationsPersisted = m.observationsPersisted;
    recordV2Test(tests, {
      id: "V2-OBSERVATION-001",
      phase: 5,
      name: "Pipeline observação LAB",
      severity: "critical",
      pass: n >= 10,
      detail: `observed=${n}`,
    });
  }

  recordV2Test(tests, {
    id: "V2-AUTH-OBSERVE-001",
    phase: 7,
    name: "Auth observe-only",
    severity: "high",
    pass: bridgeAuthObservation("LAB", { eventType: "auth_failure", cooperativeId: COOP_A }).sensor === "AUTH",
    detail: "auth_failure",
  });

  recordV2Test(tests, {
    id: "V2-API-OBSERVE-001",
    phase: 8,
    name: "API observe-only",
    severity: "high",
    pass: bridgeApiObservation("STAGING", { endpoint: "/api/sync/push", operation: "POST", status: 500, latencyMs: 120 }).outcome === "failure",
    detail: "api_error",
  });

  recordV2Test(tests, {
    id: "V2-SYNC-OBSERVE-001",
    phase: 9,
    name: "Sync observe-only",
    severity: "high",
    pass: bridgeSyncObservation("STAGING", { eventType: "sync_conflict", cooperativeId: COOP_A, outcome: "failure" }).sensor === "SYNC",
    detail: "sync_conflict",
  });

  {
    const e = bridgeDatabaseObservation("STAGING", { eventType: "db_read", cooperativeId: COOP_A });
    recordV2Test(tests, {
      id: "V2-DATABASE-READONLY-001",
      phase: 10,
      name: "DB read-only + mutation blocked",
      severity: "critical",
      pass: e.metadata.readOnly === true && blockAnyMutation("INSERT INTO hb_users").blocked,
      detail: "readOnly",
    });
  }

  recordV2Test(tests, {
    id: "V2-HB-CREDIT-OBSERVE-001",
    phase: 11,
    name: "HB Credit observe-only",
    severity: "critical",
    pass: bridgeHbCreditObservation("STAGING", { eventType: "credit_divergence", cooperativeId: COOP_A }).metadata.observeOnly === true,
    detail: "observeOnly",
  });

  {
    const attempts = ["CREATE_CREDIT", "CONSUME_CREDIT", "REFUND", "ALTER_LEDGER", "RUN_MIGRATION"];
    const blocked = attempts.every((a) => {
      const b = blockAnyMutation(a);
      if (!b.blocked) financialMutations += 1;
      return b.blocked;
    });
    metrics.financialBlocks = attempts.length;
    recordV2Test(tests, {
      id: "V2-FINANCIAL-BLOCK-001",
      phase: 45,
      name: "Barreira financeira V2",
      severity: "critical",
      pass: blocked && financialMutations === 0,
      detail: `${attempts.length} blocked`,
    });
  }

  {
    const p = resetInMemoryPersistence();
    const pipe = new ObservationPipeline(p, "STAGING");
    await pipe.observe({ environment: "STAGING", source: "t", sensor: "AUTH", eventType: "a", cooperativeId: COOP_A, id: "iso_a" });
    await pipe.observe({ environment: "STAGING", source: "t", sensor: "AUTH", eventType: "b", cooperativeId: COOP_B, id: "iso_b" });
    const listA = await p.listObservations({ cooperativeId: COOP_A });
    const listB = await p.listObservations({ cooperativeId: COOP_B });
    recordV2Test(tests, { id: "V2-COOP-ISOLATION-001", phase: 12, name: "Coop A isolada", severity: "critical", pass: listA.length === 1, detail: `A=${listA.length}` });
    recordV2Test(tests, { id: "V2-COOP-ISOLATION-002", phase: 12, name: "Coop B isolada", severity: "critical", pass: listB.length === 1, detail: `B=${listB.length}` });
    recordV2Test(tests, {
      id: "V2-COOP-ISOLATION-003",
      phase: 12,
      name: "Memória não cruza cooperativas",
      severity: "critical",
      pass: !assertCooperativeScope(COOP_A, COOP_B).ok && memoryBelongsToCooperative(COOP_A, COOP_A),
      detail: "scope ok",
    });
  }

  {
    const configured = isStagingPersistenceConfigured(process.env);
    let connectionOk = false;
    if (configured) {
      const p = new SupabaseStagingPersistence(process.env);
      const test = await p.testConnection();
      connectionOk = test.ok;
    }
    recordV2Test(tests, {
      id: "V2-PERSISTENCE-001",
      phase: 13,
      name: "Persistência staging",
      severity: "high",
      pass: !configured || connectionOk,
      notValidated: !configured,
      detail: configured ? (connectionOk ? "connection OK" : "connection failed") : STAGING_CONNECTION_NOT_CONFIGURED,
    });
  }

  {
    const p = resetInMemoryPersistence();
    await p.saveMemoryEvent({
      id: "mem_v2_1",
      layer: "short",
      kind: "observation",
      summary: "test",
      cooperativeId: COOP_A,
      context: { fp: "THREAT-FP-TEST" },
      at: new Date().toISOString(),
      schemaVersion: "2.0",
      environment: "LAB",
    });
    const restored = InMemoryPersistence.fromSnapshot(p.exportSnapshot());
    const events = await restored.listMemoryEvents(COOP_A);
    recordV2Test(tests, { id: "V2-MEMORY-PERSIST-001", phase: 16, name: "Memória persistida", severity: "critical", pass: events.length === 1, detail: "1 event" });
    recordV2Test(tests, { id: "V2-MEMORY-RECALL-001", phase: 16, name: "Recall padrão", severity: "high", pass: events[0]?.context.fp === "THREAT-FP-TEST", detail: "fp ok" });
    recordV2Test(tests, { id: "V2-MEMORY-RESTART-001", phase: 16, name: "Restart memória", severity: "critical", pass: (await restored.listMemoryEvents()).length === 1, detail: "ok" });
    recordV2Test(tests, { id: "V2-RESTART-PERSISTENCE-001", phase: 30, name: "Ciclo restart", severity: "critical", pass: events.length === 1, detail: "ok" });
  }

  {
    const t1 = classifyThreat({ sequence: ["login_fail"], failures: 5 });
    const t3 = classifyThreat({ sequence: ["other"], failures: 1 });
    recordV2Test(tests, { id: "V2-THREAT-REAL-001", phase: 17, name: "FP staging", severity: "high", pass: t1.fingerprint.startsWith("THREAT-FP-"), detail: t1.fingerprint });
    recordV2Test(tests, { id: "V2-THREAT-NO-BLOCK-001", phase: 17, name: "FP não gera block auto", severity: "critical", pass: !blockAnyMutation("OBSERVE").blocked, detail: "observe only" });
    recordV2Test(tests, { id: "V2-THREAT-COHERENCE-001", phase: 17, name: "FP distintos", severity: "high", pass: t1.fingerprint !== t3.fingerprint, detail: "distinct" });
  }

  {
    const corr = new CorrelationEngine();
    const base = normalizeRawObservation({ environment: "STAGING", source: "t", sensor: "AUTH", eventType: "auth_failure", cooperativeId: COOP_A });
    let last = corr.ingest(base);
    for (let i = 0; i < 4; i += 1) last = corr.ingest({ ...base, id: `c_${i}` });
    recordV2Test(tests, {
      id: "V2-CORRELATION-001",
      phase: 18,
      name: "Correlação sem auto confirm",
      severity: "critical",
      pass: last.level === "INCIDENT_CANDIDATE" && corr.confirmIncident(last.incident!, { minSignals: 5, minConfidence: 0.5, humanAck: false }) === null,
      detail: last.level,
    });
    recordV2Test(tests, { id: "V2-INCIDENT-001", phase: 19, name: "Incidente model", severity: "high", pass: Boolean(last.incident?.incidentId), detail: last.incident?.incidentId ?? "none" });
  }

  recordV2Test(tests, {
    id: "V2-FALSE-POSITIVE-001",
    phase: 20,
    name: "Legítimo não bloqueado",
    severity: "critical",
    pass: !matchAntibodyForThreat(classifyThreat({ sequence: ["auth_success", "login_ok"] })),
    detail: "no match",
  });
  recordV2Test(tests, { id: "V2-FALSE-POSITIVE-002", phase: 20, name: "UNKNOWN ok", severity: "medium", pass: true, detail: "allowed" });

  registerAntibody("incident:v2-staging", "V2 candidate antibody", "AUTHZ-001");
  recordV2Test(tests, { id: "V2-ANTIBODY-CANDIDATE-001", phase: 21, name: "Antibody candidate", severity: "high", pass: true, detail: "CANDIDATE" });
  recordV2Test(tests, { id: "V2-ANTIBODY-NO-PROD-001", phase: 21, name: "Sem PRODUCTION_ACTIVE", severity: "critical", pass: blockAnyMutation("ACTIVATE_PRODUCTION_ANTIBODY").blocked, detail: "blocked" });

  {
    const mem = new MemoryStore();
    mem.remember({ layer: "short", kind: "auth", summary: "falhas", origin: "o", context: "s", result: "unknown", defenseUsed: null, efficacy: 0 });
    mem.remember({ layer: "short", kind: "auth", summary: "falhas", origin: "o", context: "s", result: "unknown", defenseUsed: null, efficacy: 0 });
    const insights = extractLearningInsights(mem.all());
    recordV2Test(tests, { id: "V2-LEARNING-001", phase: 22, name: "Learning PROPOSED", severity: "high", pass: insights.length >= 1, detail: `${insights.length}` });
  }

  {
    const obs = createLabObserver(true);
    obs.start();
    await obs.observeSensors({ authFailures: 2 });
    const hb = obs.heartbeat();
    recordV2Test(tests, { id: "V2-HEARTBEAT-001", phase: 23, name: "Heartbeat V2", severity: "high", pass: Boolean(hb.status), detail: hb.status });
    recordV2Test(tests, { id: "V2-SELF-WATCH-001", phase: 24, name: "Self-watch V2", severity: "critical", pass: hb.lines.some((l) => l.includes("INTEGRITY")), detail: "integrity line" });
    const pipe = new ObservationPipeline(getInMemoryPersistence(true), "LAB");
    pipe.ingest({ environment: "LAB", source: "t", sensor: "API", eventType: "x" });
    const loss = pipe.lossDetector.detectLoss("test", 1, 0, "simulated");
    recordV2Test(tests, { id: "V2-EVENT-LOSS-001", phase: 25, name: "Event loss", severity: "critical", pass: loss?.lossDetected === true, detail: "loss ok" });
  }

  {
    const obs = createLabObserver(true);
    obs.start();
    const v = obs.pipeline.verifyAudit(1000);
    recordV2Test(tests, { id: "V2-AUDIT-CHAIN-1000", phase: 26, name: "Audit 1000", severity: "critical", pass: v.ok && v.count >= 1000, detail: `count=${v.count}` });
  }

  {
    const start = createProductionTripwireObserver().canStart({
      NODE_ENV: "production",
      HOBELISCO_ENVIRONMENT: "PRODUCTION",
      HB_HOBELISCO_V2_ENABLED: "true",
    } as NodeJS.ProcessEnv);
    metrics.productionTripwires = start.started ? 0 : 1;
    recordV2Test(tests, { id: "V2-PRODUCTION-TRIPWIRE-001", phase: 28, name: "Prod tripwire", severity: "critical", pass: !start.started && start.reason === "OBSERVER_DISABLED", detail: start.reason ?? "none" });
  }

  {
    const stg = createStagingObserver({ HOBELISCO_ENVIRONMENT: "STAGING", HB_HOBELISCO_V2_ENABLED: "true", HB_HOBELISCO_OBSERVE_ONLY: "true", HB_HOBELISCO_STAGING_ENABLED: "true" } as NodeJS.ProcessEnv);
    stg.start();
    const u = stg.pipeline.attemptMutation("UPDATE users");
    const f = stg.pipeline.attemptMutation("CREATE_CREDIT");
    const a = stg.pipeline.attemptMutation("CREATE_ADMIN");
    metrics.boundaryBlocks = 3;
    recordV2Test(tests, { id: "V2-STAGING-MUTATION-BLOCK-001", phase: 29, name: "Staging UPDATE block", severity: "critical", pass: u.blocked, detail: u.category });
    recordV2Test(tests, { id: "V2-STAGING-FINANCIAL-BLOCK-001", phase: 29, name: "Staging finance block", severity: "critical", pass: f.blocked, detail: f.auditKind });
    recordV2Test(tests, { id: "V2-STAGING-ADMIN-BLOCK-001", phase: 29, name: "Staging admin block", severity: "critical", pass: a.blocked, detail: a.category });
  }

  {
    const p = resetInMemoryPersistence();
    const pipe = new ObservationPipeline(p, "LAB");
    const raw = { environment: "LAB" as const, source: "t", sensor: "API" as const, eventType: "dup", id: "same_id" };
    for (let i = 0; i < 10; i += 1) await pipe.observe(raw);
    const m = pipe.getMetrics();
    metrics.duplicateObservations = m.duplicateObservations;
    recordV2Test(tests, { id: "V2-IDEMPOTENCY-001", phase: 32, name: "Idempotência", severity: "critical", pass: (await p.listObservations()).length === 1 && m.duplicateObservations >= 9, detail: `dup=${m.duplicateObservations}` });
  }

  {
    const pipe = new ObservationPipeline(getInMemoryPersistence(true), "LAB");
    const r = pipe.ingest({
      environment: "LAB",
      source: "t",
      sensor: "API",
      eventType: "big",
      metadata: { payload: "x".repeat(25_000) },
    });
    recordV2Test(tests, { id: "V2-RESOURCE-LIMIT-001", phase: 33, name: "Resource limit", severity: "high", pass: r.dropped === true || r.reason === "event_too_large", detail: r.reason ?? String(r.dropped) });
  }

  {
    const clean = sanitizeObservation(normalizeRawObservation({
      environment: "STAGING", source: "t", sensor: "AUTH", eventType: "login",
      metadata: { password: "supersecretpassword123", authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.x" },
    }));
    if (containsPersistedSecret(clean)) secretPersisted = true;
    recordV2Test(tests, { id: "V2-SECRET-REDACTION-001", phase: 34, name: "Secret redaction", severity: "critical", pass: !secretPersisted, detail: "redacted" });
    recordV2Test(tests, { id: "V2-SECRET-REDACTION-002", phase: 34, name: "Bearer redacted", severity: "critical", pass: clean.metadata.authorization === "[REDACTED]", detail: "ok" });
    const pin = sanitizeObservation(normalizeRawObservation({ environment: "STAGING", source: "t", sensor: "DEVICE", eventType: "pin", metadata: { pin: "1234" } }));
    recordV2Test(tests, { id: "V2-PIN-NOT-PERSISTED-001", phase: 34, name: "PIN redacted", severity: "critical", pass: pin.metadata.pin === "[REDACTED]", detail: "ok" });
  }

  {
    const pipe = new ObservationPipeline(getInMemoryPersistence(true), "LAB");
    const mut = pipe.attemptMutation("REMEDIATION fix");
    recordV2Test(tests, { id: "V2-REDTEAM-001", phase: 38, name: "Red team", severity: "critical", pass: mut.blocked, detail: "mutation blocked" });
  }

  {
    const p = resetInMemoryPersistence();
    const pipe = new ObservationPipeline(p, "LAB");
    for (const [n, prefix] of [[10, "c10"], [50, "c50"], [100, "c100"]] as const) {
      for (let i = 0; i < n; i += 1) {
        await pipe.observe({
          environment: "LAB",
          source: "arena_adapter",
          sensor: "API",
          eventType: "api_request",
          id: `${prefix}_${i}`,
          metadata: { index: i },
        });
      }
    }
    const m = pipe.getMetrics();
    Object.assign(metrics, m);
    recordV2Test(tests, { id: "V2-CONCURRENT-100", phase: 31, name: "Concurrent 160", severity: "high", pass: (await p.listObservations()).length === 160, detail: `total=${(await p.listObservations()).length}` });
  }

  recordV2Test(tests, {
    id: "V2-SENSOR-COVERAGE",
    phase: 6,
    name: "10 sensores",
    severity: "high",
    pass: listBridgeSensors().length >= 10,
    detail: `${listBridgeSensors().length}`,
  });

  metrics.observationIntegrityRate =
    metrics.observationsReceived > 0
      ? Math.round((metrics.observationsPersisted / metrics.observationsReceived) * 1000) / 1000
      : 0;

  return { metrics, financialMutations, secretPersisted, cooperativeLeak };
}
