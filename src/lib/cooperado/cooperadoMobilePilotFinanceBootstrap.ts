import type { User } from "@/types";
import { isCooperadoMobilePilot } from "@/lib/cooperado/cooperadoMobilePilot";
import { executarCooperadoAtualizarManual } from "@/lib/cooperado/cooperadoAtualizarManual";
import { cooperadoPilotForcarRematerializacaoFinanceira } from "@/lib/cooperado/cooperadoMobilePilotFinanceReadRecovery";
import { cooperadoPilotMotorCardInicioTemValor } from "@/lib/cooperado/cooperadoMobilePilotInicioValorLocal";
import { cooperadoTemDadosFinanceirosMinimos } from "@/lib/cooperado/cooperadoTemDadosFinanceirosMinimos";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { cooperadoFinanceiroBloqueiaEntradaApp } from "@/services/fichaSyncGuard";
import { getData, isAppDataWarm, preloadAppData, waitForAppDataWarm } from "@/services/dataStore";
import { getUserCooperativaId } from "@/utils/cooperativa";

let bootstrapUserId: string | null = null;

/**
 * Piloto Jeferson — uma vez por sessão: warm AppData, rematerializa se já há fatia local,
 * senão sync operacional em idle (não bloqueia troca de abas).
 */
export function scheduleCooperadoPilotFinanceBootstrapOnce(
  user: Omit<User, "password"> | null | undefined
): void {
  if (!user || user.role !== "cooperado" || !isCooperadoMobilePilot(user)) return;
  if (bootstrapUserId === user.id) return;
  bootstrapUserId = user.id;

  const run = () => {
    preloadAppData();
    void waitForAppDataWarm(12_000).then((warm) => {
      if (!warm) {
        void executarCooperadoAtualizarManual();
        return;
      }
      const data = getData();
      const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
      if (!coopId || !user.cooperadoId) {
        void executarCooperadoAtualizarManual();
        return;
      }
      const canon = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
      const temLocal = cooperadoTemDadosFinanceirosMinimos(data, canon, coopId);
      const bloqueia = cooperadoFinanceiroBloqueiaEntradaApp(data, canon, coopId);
      const cardOk = cooperadoPilotMotorCardInicioTemValor(data, user.cooperadoId, coopId);

      if (temLocal && !bloqueia && cardOk) {
        cooperadoPilotForcarRematerializacaoFinanceira(user);
        return;
      }
      if (temLocal && !cardOk) {
        cooperadoPilotForcarRematerializacaoFinanceira(user);
      }
      if (!temLocal || bloqueia || !cardOk) {
        void executarCooperadoAtualizarManual();
      }
    });
  };

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 2_500 });
  } else {
    window.setTimeout(run, 400);
  }
}

/** @internal testes */
export function resetCooperadoPilotFinanceBootstrapForTests(): void {
  bootstrapUserId = null;
}
