/**
 * PWA mensageiro — atualiza operacional na nuvem sem pull de notas (lançamento do responsável).
 */
import type { User } from "@/types";
import type { CooperativaCloudRevision } from "@/lib/performance/cooperadoEventDrivenSync";
import {
  fingerprintCooperativaCloudRevision,
  persistAppliedCooperativaCloudRevision,
  persistCooperadoLastOperacionalSyncAt,
} from "@/lib/performance/cooperadoEventDrivenSync";
import { cooperadoPwaMaterializarSnapshotsFinanceirosPosSync } from "@/lib/cooperado/cooperadoPwaFinanceiroSnapshotRefresh";
import { clearCooperadoPwaDadosDesatualizados } from "@/lib/cooperado/cooperadoPwaDadosFreshness";
import { syncCooperadoMessengerOperacionalLightFromCloud } from "@/services/cooperativaSyncCloudService";
import { normalizeCnpj } from "@/utils/cooperativa";

let inflight: Promise<boolean> | null = null;
let inflightKey: string | null = null;

export function runCooperadoMessengerOperacionalLightPull(opts: {
  cnpj: string;
  cooperativaId: string;
  user: Omit<User, "password">;
  remote: CooperativaCloudRevision;
}): Promise<boolean> {
  const digits = normalizeCnpj(opts.cnpj);
  if (digits.length !== 14) return Promise.resolve(false);
  const key = `${digits}|${fingerprintCooperativaCloudRevision(opts.remote)}`;
  if (inflight && inflightKey === key) return inflight;

  inflightKey = key;
  inflight = (async () => {
    try {
      await syncCooperadoMessengerOperacionalLightFromCloud(digits, opts.cooperativaId);
      cooperadoPwaMaterializarSnapshotsFinanceirosPosSync(opts.user);
      persistAppliedCooperativaCloudRevision(digits, fingerprintCooperativaCloudRevision(opts.remote));
      persistCooperadoLastOperacionalSyncAt();
      clearCooperadoPwaDadosDesatualizados();
      return true;
    } catch {
      return false;
    } finally {
      if (inflightKey === key) {
        inflight = null;
        inflightKey = null;
      }
    }
  })();

  return inflight;
}
