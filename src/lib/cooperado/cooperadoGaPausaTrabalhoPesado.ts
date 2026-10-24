import type { User } from "@/types";
import {
  cooperadoFinanceiroCardCacheTemValor,
  cooperadoFinanceiroExibicaoCachePronto,
} from "@/lib/cooperado/cooperadoFinanceiroDisplayCache";
import { cooperadoGaValorReceberExibicaoResolvida } from "@/lib/cooperado/cooperadoGaExibicaoFinanceiraRecovery";
import { cooperadoPilotFinanceiroExibirComSnapshotsLocais } from "@/lib/cooperado/cooperadoMobilePilotFinanceReadRecovery";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import { cooperadoTabSwitchQuiescenceActive } from "@/lib/cooperado/cooperadoTabSwitchQuiescence";
import { cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem } from "@/lib/cooperado/cooperadoGaExibicaoFinanceiraRecovery";

/** Evita pulso/sync/rematerialização enquanto o cooperado navega ou já vê valor no card. */
export function cooperadoGaPausaTrabalhoFinanceiroPesado(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado" || !isCooperadoMobileGaPromoted(user)) return false;
  if (cooperadoTabSwitchQuiescenceActive()) return true;
  if (cooperadoFinanceiroCardCacheTemValor(user)) return true;
  if (cooperadoFinanceiroExibicaoCachePronto(user)) return true;
  if (cooperadoPilotFinanceiroExibirComSnapshotsLocais(user)) return true;
  return cooperadoGaValorReceberExibicaoResolvida(user);
}

/** Pulso BIC / rematerialização — não bloqueia sync de nuvem quando exibição ainda está zerada. */
export function cooperadoGaPausaPulsoBicOuRematerializacao(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado" || !isCooperadoMobileGaPromoted(user)) return false;
  if (cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem(user)) return false;
  return cooperadoGaPausaTrabalhoFinanceiroPesado(user);
}
