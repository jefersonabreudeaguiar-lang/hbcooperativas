/**
 * Cooperado GA/PWA — pull leve de notas quando a revisão na nuvem mudou.
 * Não espera operacional/HB aqui (isso trava o Atualizar). Só marca as notas
 * como vistas; a ficha (A receber / Financeiro) vem no pull operacional.
 */
import type { User } from "@/types";
import type { CooperativaCloudRevision } from "@/lib/performance/cooperadoEventDrivenSync";
import {
  fingerprintCooperativaCloudRevision,
  persistAppliedCooperativaNotasRevision,
} from "@/lib/performance/cooperadoEventDrivenSync";
import { runCooperadoMessengerOperacionalLightPull } from "@/lib/cooperado/cooperadoMessengerOperacionalLightPull";
import { cooperadoTemConferidaAguardandoFicha } from "@/services/fichaSyncGuard";
import { getCooperadoRunSyncSessionLease } from "@/services/operacionalPullLease";
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
      persistAppliedCooperativaNotasRevision(digits, opts.remote);

      const data = isAppDataWarm() ? getData() : null;
      const coopId = data
        ? getUserCooperativaId(opts.user, data) ?? opts.user.cooperativaId
        : opts.user.cooperativaId;
      const cooperadoId = opts.user.cooperadoId;
      const precisaFicha = Boolean(
        data &&
          coopId &&
          cooperadoId &&
          cooperadoTemConferidaAguardandoFicha(data, cooperadoId, coopId)
      );
      if (precisaFicha && coopId && !getCooperadoRunSyncSessionLease()) {
        void runCooperadoMessengerOperacionalLightPull({
          cnpj: digits,
          cooperativaId: coopId,
          user: opts.user,
          remote: opts.remote,
        });
      }
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
