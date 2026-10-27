/**
 * GA — revisão na nuvem mudou: atualiza A receber sem operacional_full imediato.
 */
import type { User } from "@/types";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import { isCooperadoBicHybridLightEnabled } from "@/lib/cooperado/cooperadoBicHybridLight";
import { cooperadoPilotForcarRematerializacaoFinanceira } from "@/lib/cooperado/cooperadoMobilePilotFinanceReadRecovery";
import { cooperadoRematerializarFinanceiroLocalSePossivel } from "@/lib/cooperado/cooperadoPwaFinanceiroSnapshotRefresh";
import { dispatchCooperadoPwaLeveUiSnapshotRefresh } from "@/lib/cooperado/cooperadoPwaLeveUiEvents";
import { scheduleCooperadoBicHybridIdleTask } from "@/lib/cooperado/cooperadoBicHybridLight";
import { runCooperadoGaSyncBaseInformacoesFinanceiras } from "@/lib/cooperado/cooperadoGaBaseInformacoesFinanceirasSync";
import { cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem } from "@/lib/cooperado/cooperadoGaExibicaoFinanceiraRecovery";
import { cooperadoMobileUiQuiescenceActive } from "@/lib/cooperado/cooperadoTabSwitchQuiescence";
import { cooperadoGaPausaTrabalhoFinanceiroPesado } from "@/lib/cooperado/cooperadoGaPausaTrabalhoPesado";
import { isCooperadoJefersonSomenteAtualizarPilot } from "@/lib/cooperado/cooperadoJefersonSomenteAtualizarPilot";

/** Agrupa vários eventos de revisão sem enfileirar operacional_full. */
const DEBOUNCE_MS = 2_000;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let debounceUserId: string | null = null;

/** Pinta o card com AppData local — O(1) na UI. */
export function rematerializarCooperadoValorCardLeve(user: Omit<User, "password">): void {
  if (cooperadoMobileUiQuiescenceActive() || cooperadoGaPausaTrabalhoFinanceiroPesado(user)) {
    return;
  }
  cooperadoPilotForcarRematerializacaoFinanceira(user);
  cooperadoRematerializarFinanceiroLocalSePossivel(user);
  dispatchCooperadoPwaLeveUiSnapshotRefresh();
}

/**
 * Pull silencioso debounced (operacional+notas via base financeira) — não bloqueia abas.
 */
export function scheduleCooperadoGaValorRevisionLightSync(
  user: Omit<User, "password"> | null | undefined
): void {
  if (typeof window === "undefined") return;
  if (isCooperadoJefersonSomenteAtualizarPilot(user)) return;
  if (!user || user.role !== "cooperado" || !isCooperadoMobileGaPromoted(user)) return;

  if (cooperadoMobileUiQuiescenceActive()) {
    scheduleCooperadoBicHybridIdleTask(() => scheduleCooperadoGaValorRevisionLightSync(user), 5_000);
    return;
  }

  rematerializarCooperadoValorCardLeve(user);

  if (debounceTimer && debounceUserId === user.id) {
    clearTimeout(debounceTimer);
  }
  debounceUserId = user.id;
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    if (cooperadoMobileUiQuiescenceActive()) {
      scheduleCooperadoGaValorRevisionLightSync(user);
      return;
    }
    const precisaNuvem = cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem(user);
    scheduleCooperadoBicHybridIdleTask(() => {
      void runCooperadoGaSyncBaseInformacoesFinanceiras(user, {
        silent: true,
        bicSession: true,
        light: isCooperadoBicHybridLightEnabled(),
        force: precisaNuvem,
      }).finally(() => {
        rematerializarCooperadoValorCardLeve(user);
      });
    }, precisaNuvem ? 600 : 1_800);
  }, DEBOUNCE_MS);
}
