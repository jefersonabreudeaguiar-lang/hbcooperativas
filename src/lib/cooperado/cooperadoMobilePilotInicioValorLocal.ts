import type { AppData } from "@/types";
import {
  cooperadoMotorTemObrigacaoReceber,
  filtrarInicioCardPersistidoLeituraBic,
  sanitizeInicioCardSnapshotFluxoBic,
  type InicioCardMotorSnapshot,
} from "@/lib/cooperadoInicioCardPolicy";
import { resolverMotorCardInicioParidadeFinanceiro } from "@/lib/cooperado/cooperadoInicioCardParidadeMotor";
import { lerInicioCardPersistidoFlexSemFiltroBuild } from "@/lib/cooperadoInicioCardPersistencia";
import { isCooperadoMobilePilotPerfActive } from "@/lib/cooperado/cooperadoMobilePilotPerf";
import {
  fichaPertenceCooperado,
  notaPertenceCooperado,
  resolverCooperadoIdCanonico,
} from "@/services/cooperadoCloudService";
import { bicCentralResolveInicioParaExibicao } from "@/services/bicLeituraCentralCooperado";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { getUserCooperativaId } from "@/utils/cooperativa";
import type { User } from "@/types";

/** Resolve cooperativaId no piloto quando sessão/AppData não trazem coopId. */
export function cooperadoPilotResolveCooperativaIdForFinance(
  data: AppData,
  cooperadoId: string,
  hint?: string
): string | undefined {
  if (hint) return hint;
  const reg = data.cooperados.find((c) => c.id === cooperadoId);
  if (reg?.cooperativaId) return reg.cooperativaId;
  if (data.cooperativas.length === 1) return data.cooperativas[0]?.id;
  for (const f of data.fichaCorrida ?? []) {
    if (f.cooperativaId && fichaPertenceCooperado(data, f, cooperadoId, f.cooperativaId)) {
      return f.cooperativaId;
    }
  }
  for (const n of data.notasPedido ?? []) {
    if (n.cooperativaId && notaPertenceCooperado(data, n, cooperadoId, n.cooperativaId)) {
      return n.cooperativaId;
    }
  }
  return undefined;
}

/** Cooperativa no piloto — usa hint da sessão e, se warm, AppData. */
export function cooperadoPilotResolverCooperativaId(
  user: Pick<User, "cooperativaId" | "cooperadoId" | "role"> | null | undefined,
  cooperativaIdHint?: string
): string | undefined {
  if (cooperativaIdHint) return cooperativaIdHint;
  if (!user?.cooperadoId) return user?.cooperativaId;
  if (!isAppDataWarm()) return user.cooperativaId;
  const data = getData();
  const fromUser = getUserCooperativaId(user as User, data) ?? user.cooperativaId;
  return fromUser ?? cooperadoPilotResolveCooperativaIdForFinance(data, user.cooperadoId);
}

/** Persistido para exibição no piloto — ignora filtro de build (purge pós-deploy). */
export function cooperadoPilotInicioCardPersistidoExibicao(
  cooperadoId: string,
  cooperativaId?: string
): InicioCardMotorSnapshot | null {
  if (!isCooperadoMobilePilotPerfActive()) return null;
  const raw = filtrarInicioCardPersistidoLeituraBic(
    lerInicioCardPersistidoFlexSemFiltroBuild(cooperadoId, cooperativaId)
  );
  if (!raw?.display) return null;
  const display = sanitizeInicioCardSnapshotFluxoBic(raw.display);
  if (!cooperadoMotorTemObrigacaoReceber(display)) return null;
  return display;
}

/** Motor piloto: paridade → BIC (consolidado), sem gate de snapshot. */
export function cooperadoPilotMotorCardInicio(
  data: AppData,
  cooperadoId: string,
  cooperativaIdHint?: string
): InicioCardMotorSnapshot | null {
  if (!isCooperadoMobilePilotPerfActive()) return null;
  const coopId = cooperadoPilotResolveCooperativaIdForFinance(data, cooperadoId, cooperativaIdHint);
  if (!coopId) return null;
  const canon = resolverCooperadoIdCanonico(data, cooperadoId, coopId);

  const { motor: paridadeMotor } = resolverMotorCardInicioParidadeFinanceiro(data, canon, coopId);
  let display = sanitizeInicioCardSnapshotFluxoBic(paridadeMotor);
  if (cooperadoMotorTemObrigacaoReceber(display)) return display;

  const bic = bicCentralResolveInicioParaExibicao(data, canon, coopId, {
    apresentacaoConsolidada: true,
  });
  display = sanitizeInicioCardSnapshotFluxoBic({
    mesLabel: bic.mesLabel?.trim() || display.mesLabel,
    valor: bic.valor > 0 ? bic.valor : display.valor,
    valorRecibo: bic.valorRecibo ?? display.valorRecibo,
    aguardandoAssinatura: Boolean(bic.aguardandoAssinatura),
  });
  if (cooperadoMotorTemObrigacaoReceber(display)) return display;
  if (bic.exibir && bic.valor > 0) return display;
  return display.valor > 0 ? display : null;
}

export function cooperadoPilotMotorCardInicioTemValor(
  data: AppData,
  cooperadoId: string,
  cooperativaIdHint?: string
): boolean {
  const motor = cooperadoPilotMotorCardInicio(data, cooperadoId, cooperativaIdHint);
  return Boolean(motor && cooperadoMotorTemObrigacaoReceber(motor));
}

export function cooperadoPilotCardInicioLeituraRapida(
  cooperadoId: string | undefined,
  cooperativaId: string | undefined,
  user?: Pick<User, "cooperativaId" | "cooperadoId" | "role"> | null
): InicioCardMotorSnapshot | null {
  if (!cooperadoId || !isCooperadoMobilePilotPerfActive()) return null;
  const coopHint = cooperativaId ?? cooperadoPilotResolverCooperativaId(user, cooperativaId);
  if (isAppDataWarm()) {
    const motor = cooperadoPilotMotorCardInicio(getData(), cooperadoId, coopHint);
    if (motor && cooperadoMotorTemObrigacaoReceber(motor)) return motor;
  }
  return cooperadoPilotInicioCardPersistidoExibicao(cooperadoId, coopHint ?? cooperativaId);
}
