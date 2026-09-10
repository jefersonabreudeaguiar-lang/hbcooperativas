/**
 * Probes read-only do HB Coop — SELECT only, fora do boundary lab
 */

import {
  bridgeSyncObservation,
} from "@lab/hobelisco-hx/observation/SensorBridge";
import { resolveHobeliscoEnvironment } from "@lab/hobelisco-hx/environment/HobeliscoEnvironment";
import type { HobeliscoObservationEvent } from "@lab/hobelisco-hx/observation/types";
import { observeNormalized } from "@lab/hobelisco-hx/observer/ObserverSingleton";
import { getStagingSupabaseClient } from "@lab/hobelisco-hx/persistence/SupabaseStagingPersistence";
import { isCreditWatchEnabled, runHbCreditWatchForCoop } from "@/lib/lab/hbCreditWatch";

async function probeSyncReadOnly(cnpj: string): Promise<HobeliscoObservationEvent[]> {
  const client = getStagingSupabaseClient();
  if (!client) return [];
  const digits = cnpj.replace(/\D/g, "");
  const env = resolveHobeliscoEnvironment();
  const { count, error } = await client
    .from("sync_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("cooperative_cnpj", digits)
    .eq("status", "error");
  if (error) return [];
  if ((count ?? 0) > 0) {
    return [
      bridgeSyncObservation(env, {
        eventType: `sync_errors_${count}`,
        cooperativeId: cnpj,
        outcome: "failure",
      }),
    ];
  }
  return [];
}

export async function runHbCoopProbeCycle(cooperativeIds?: string[]): Promise<number> {
  const coops =
    cooperativeIds?.length
      ? cooperativeIds
      : [process.env.HB_HOBELISCO_PROBE_COOP_CNPJ].filter(Boolean) as string[];
  if (coops.length === 0) return 0;

  let count = 0;
  for (const cnpj of coops) {
    if (isCreditWatchEnabled()) {
      const run = await runHbCreditWatchForCoop(cnpj);
      count += run.observationsEmitted;
    }

    const syncEvents = await probeSyncReadOnly(cnpj);
    for (const e of syncEvents) {
      observeNormalized(e);
      count += 1;
    }
  }
  return count;
}

/** @deprecated Use runHbCreditWatchForCoop — mantido para compatibilidade de imports */
export { runHbCreditWatchForCoop as probeCreditReadOnlyCycle } from "@/lib/lab/hbCreditWatch";
