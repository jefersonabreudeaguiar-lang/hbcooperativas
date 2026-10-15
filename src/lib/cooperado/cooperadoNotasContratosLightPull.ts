/**
 * Cooperado GA/PWA — pull leve de notas + contratos quando a revisão na nuvem mudou,
 * sem operacional_full (evita travar o celular na abertura).
 */
import type { User } from "@/types";
import type { CooperativaCloudRevision } from "@/lib/performance/cooperadoEventDrivenSync";
import {
  fingerprintCooperativaCloudRevision,
  persistAppliedCooperativaCloudRevision,
} from "@/lib/performance/cooperadoEventDrivenSync";
import { cooperadoPwaMaterializarSnapshotsFinanceirosPosSync } from "@/lib/cooperado/cooperadoPwaFinanceiroSnapshotRefresh";
import { clearCooperadoPwaDadosDesatualizados } from "@/lib/cooperado/cooperadoPwaDadosFreshness";
import { syncContratosFromCloud } from "@/services/cooperativaSyncCloudService";
import { syncNotasPedidoFromCloud } from "@/services/notaPedidoCloudService";
import { normalizeCnpj } from "@/utils/cooperativa";

let inflight: Promise<boolean> | null = null;
let inflightKey: string | null = null;

export function runCooperadoNotasContratosLightPull(opts: {
  cnpj: string;
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
      await syncNotasPedidoFromCloud(digits, { retryFull: false });
      await syncContratosFromCloud(digits);
      cooperadoPwaMaterializarSnapshotsFinanceirosPosSync(opts.user, { light: true });
      persistAppliedCooperativaCloudRevision(
        digits,
        fingerprintCooperativaCloudRevision(opts.remote)
      );
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
