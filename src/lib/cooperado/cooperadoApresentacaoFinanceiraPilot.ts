import type { User } from "@/types";
import {
  cooperadoApresentacaoFinanceiraConsolidada,
  type CooperadoSyncPresentationInput,
} from "@/lib/cooperadoApresentacaoFinanceira";
import { isCooperadoMobilePilot } from "@/lib/cooperado/cooperadoMobilePilot";
import { cooperadoPilotFinanceGateLiveL1Path } from "@/lib/cooperado/cooperadoMobilePilotPerf";
import {
  cooperadoPilotAppDataTemFinanceiroLocal,
  cooperadoPilotFinanceiroExibirComSnapshotsLocais,
} from "@/lib/cooperado/cooperadoMobilePilotFinanceReadRecovery";

/**
 * Apresentação financeira — GA inalterada; piloto Jeferson usa L1 em abas leves.
 */
export function cooperadoApresentacaoFinanceiraConsolidadaForSession(
  input: CooperadoSyncPresentationInput,
  user: Omit<User, "password"> | null | undefined,
  pathname: string
): boolean {
  if (!user || !isCooperadoMobilePilot(user) || !cooperadoPilotFinanceGateLiveL1Path(pathname)) {
    return cooperadoApresentacaoFinanceiraConsolidada(input);
  }
  if (input.role !== "cooperado") return true;
  if (input.exibirComDadosLocais) return true;
  if (cooperadoPilotFinanceiroExibirComSnapshotsLocais(user)) return true;
  if (cooperadoPilotAppDataTemFinanceiroLocal(user)) return true;
  if (input.dadosFinanceirosConsistentes === false) return false;
  return input.cooperadoPagamentosHydrated;
}
