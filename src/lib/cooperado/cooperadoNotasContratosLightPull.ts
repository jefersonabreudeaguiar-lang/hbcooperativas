/**
 * Cooperado GA/PWA — pull leve de notas quando a revisão na nuvem mudou.
 * Se o responsável já aprovou e a ficha local ainda não entrou, puxa o operacional
 * (A receber + HB) antes de gravar o snapshot — senão Entregas atualiza e o valor fica velho.
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
import { refreshContaCoopDescontosAfterOperacionalSync } from "@/lib/hb-credit/syncContaCoopFichaDescontos";
import { shouldSyncHbFichaBaseDescontos } from "@/lib/hb-credit/hbFichaBaseOperacional";
import { cooperativaTemNotasConferidasSemFichaLocal } from "@/services/fichaSyncGuard";
import { syncCooperadoMessengerOperacionalLightFromCloud } from "@/services/cooperativaSyncCloudService";
import { syncNotasPedidoFromCloud } from "@/services/notaPedidoCloudService";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";

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
      const data = isAppDataWarm() ? getData() : null;
      const coopId = data
        ? getUserCooperativaId(opts.user, data) ?? opts.user.cooperativaId
        : opts.user.cooperativaId;
      const fichaAtrasada = Boolean(
        data && coopId && cooperativaTemNotasConferidasSemFichaLocal(data, coopId)
      );
      if (fichaAtrasada && coopId) {
        await syncCooperadoMessengerOperacionalLightFromCloud(digits, coopId);
        persistCooperadoLastOperacionalSyncAt();
        if (shouldSyncHbFichaBaseDescontos()) {
          await refreshContaCoopDescontosAfterOperacionalSync({
            cnpj: digits,
            cooperativaId: coopId,
            user: opts.user,
          });
        }
        cooperadoPwaMaterializarSnapshotsFinanceirosPosSync(opts.user);
      } else {
        cooperadoPwaMaterializarSnapshotsFinanceirosPosSync(opts.user, { light: true });
      }
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
