import { bridgeHbCreditObservation } from "@lab/hobelisco-hx/observation/SensorBridge";
import { resolveHobeliscoEnvironment } from "@lab/hobelisco-hx/environment/HobeliscoEnvironment";
import { observeNormalized } from "@lab/hobelisco-hx/observer/ObserverSingleton";
import { initHobeliscoObserver } from "@lab/hobelisco-hx/observer/ObserverSingleton";
import { isHobeliscoV2ObserverEnabledServer } from "@/lib/lab/hobeliscoV2Gate";
import { loadCreditWatchConfig, isCreditWatchEnabled } from "./config";
import { buildProbeRunId, buildProbeRunKey, buildSnapshotId } from "./fingerprint";
import { readCreditAccountsReadOnly } from "./probe";
import { getCreditWatchRepository } from "./repository";
import {
  buildCreditObservation,
  evaluateCreditObservation,
  filterActionableFindings,
  mapSeverityToObservation,
} from "./rules";
import { compareWithPreviousSnapshot } from "./snapshot";
import type { CreditWatchRunResult } from "./types";

export async function runHbCreditWatchForCoop(coopCnpj: string): Promise<CreditWatchRunResult> {
  const started = Date.now();
  const runId = buildProbeRunId();
  const cfg = loadCreditWatchConfig();
  const repo = getCreditWatchRepository();
  const runKey = buildProbeRunKey(coopCnpj, "hb_credit_accounts", cfg.intervalMinutes);

  if (repo.hasRunKey(runKey)) {
    return {
      runId,
      coopCnpj,
      accountsRead: 0,
      findingsCreated: 0,
      findingsUpdated: 0,
      findingsResolved: 0,
      observationsEmitted: 0,
      durationMs: Date.now() - started,
      error: "idempotent_skip",
    };
  }

  repo.markRunKey(runKey);
  const observedAt = new Date().toISOString();
  const snapshotId = buildSnapshotId(coopCnpj, runKey);

  const readResult = await readCreditAccountsReadOnly(coopCnpj);
  if (!readResult.ok) {
    emitProbeError(coopCnpj, readResult.error, runId);
    repo.saveSnapshot({
      id: snapshotId,
      coopCnpj,
      probeType: "hb_credit_accounts",
      observedAt,
      status: "ERROR",
      payloadHash: "error",
      accountsRead: 0,
      runId,
      createdAt: observedAt,
    });
    return {
      runId,
      coopCnpj,
      accountsRead: 0,
      findingsCreated: 0,
      findingsUpdated: 0,
      findingsResolved: 0,
      observationsEmitted: 1,
      durationMs: Date.now() - started,
      error: readResult.error,
    };
  }

  const previous = repo.getLatestSnapshot(coopCnpj);
  const comparison = compareWithPreviousSnapshot(readResult.accounts, previous);
  const allFindings = readResult.accounts.flatMap((row) => {
    const obs = buildCreditObservation(coopCnpj, row, observedAt);
    return evaluateCreditObservation(obs, snapshotId);
  });
  const actionable = filterActionableFindings(allFindings);
  const activeBefore = new Set(repo.listActiveFindings(coopCnpj).map((f) => f.fingerprint));

  let findingsCreated = 0;
  let findingsUpdated = 0;
  let observationsEmitted = 0;
  const activeNow = new Set<string>();

  for (const finding of actionable) {
    activeNow.add(finding.fingerprint);
    const saved = repo.saveFinding(finding);
    if (saved.created) findingsCreated += 1;
    else findingsUpdated += 1;

    const env = resolveHobeliscoEnvironment();
    const event = bridgeHbCreditObservation(env, {
      eventType: finding.eventType,
      cooperativeId: coopCnpj,
      metadata: {
        observeOnly: true,
        accountId: finding.accountId,
        cooperadoId: finding.cooperadoId,
        expectedCents: finding.expectedCents ?? 0,
        observedCents: finding.observedCents ?? 0,
        differenceCents: finding.differenceCents ?? 0,
        stableFingerprint: finding.stableFingerprint,
        runId,
        severity: finding.severity,
      },
    });
    event.severity = mapSeverityToObservation(finding.severity);
    event.metadata.stableFingerprint = finding.stableFingerprint;
    event.metadata.occurrences = saved.created ? 1 : 2;

    if (isHobeliscoV2ObserverEnabledServer()) {
      initHobeliscoObserver();
      observeNormalized(event);
    }
    observationsEmitted += 1;
  }

  let findingsResolved = 0;
  for (const fp of activeBefore) {
    if (!activeNow.has(fp)) {
      if (repo.resolveFinding(fp, observedAt)) findingsResolved += 1;
    }
  }

  if (actionable.length === 0) {
    const env = resolveHobeliscoEnvironment();
    const okEvent = bridgeHbCreditObservation(env, {
      eventType: "credit_integrity_ok",
      cooperativeId: coopCnpj,
      metadata: { observeOnly: true, runId, accountsRead: readResult.accounts.length },
    });
    okEvent.severity = "info";
    if (isHobeliscoV2ObserverEnabledServer()) {
      initHobeliscoObserver();
      observeNormalized(okEvent);
    }
    observationsEmitted += 1;
  }

  repo.saveSnapshot({
    id: snapshotId,
    coopCnpj,
    probeType: "hb_credit_accounts",
    observedAt,
    status: actionable.length > 0 ? "FINDINGS" : comparison.status,
    payloadHash: comparison.payloadHash,
    accountsRead: readResult.accounts.length,
    runId,
    createdAt: observedAt,
  });

  return {
    runId,
    coopCnpj,
    accountsRead: readResult.accounts.length,
    findingsCreated,
    findingsUpdated,
    findingsResolved,
    observationsEmitted,
    durationMs: Date.now() - started,
  };
}

export async function runHbCreditWatch(): Promise<{
  ok: boolean;
  runs: CreditWatchRunResult[];
  skipped?: string;
}> {
  if (!isCreditWatchEnabled()) {
    return { ok: false, runs: [], skipped: "credit_watch_disabled" };
  }

  const cfg = loadCreditWatchConfig();
  if (cfg.probeCoops.length === 0) {
    return { ok: false, runs: [], skipped: "no_probe_coops_configured" };
  }

  const runs: CreditWatchRunResult[] = [];
  for (const coop of cfg.probeCoops) {
    runs.push(await runHbCreditWatchForCoop(coop));
  }
  return { ok: true, runs };
}

function emitProbeError(coopCnpj: string, error: string, runId: string): void {
  if (!isHobeliscoV2ObserverEnabledServer()) return;
  initHobeliscoObserver();
  const env = resolveHobeliscoEnvironment();
  const event = bridgeHbCreditObservation(env, {
    eventType: "credit_probe_execution_error",
    cooperativeId: coopCnpj,
    metadata: { observeOnly: true, error, runId, failClosed: true },
  });
  event.severity = "critical";
  observeNormalized(event);
}
