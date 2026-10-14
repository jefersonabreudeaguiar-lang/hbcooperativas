import type { AppData } from "@/types";
import {
  cooperadoMotorTemObrigacaoReceber,
  sanitizeInicioCardSnapshotFluxoBic,
  type InicioCardMotorSnapshot,
} from "@/lib/cooperadoInicioCardPolicy";
import { resolverMotorCardInicioParidadeFinanceiro } from "@/lib/cooperado/cooperadoInicioCardParidadeMotor";
import { lerInicioCardPersistidoFlex } from "@/lib/cooperadoInicioCardPersistencia";
import { isCooperadoMobilePilotPerfActive } from "@/lib/cooperado/cooperadoMobilePilotPerf";
import { cooperadoTemDadosFinanceirosMinimos } from "@/lib/cooperado/cooperadoTemDadosFinanceirosMinimos";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { getUserCooperativaId } from "@/utils/cooperativa";
import type { User } from "@/types";

/** Cooperativa no piloto — usa hint da sessão e, se warm, AppData. */
export function cooperadoPilotResolverCooperativaId(
  user: Pick<User, "cooperativaId" | "cooperadoId" | "role"> | null | undefined,
  cooperativaIdHint?: string
): string | undefined {
  if (cooperativaIdHint) return cooperativaIdHint;
  if (!user?.cooperadoId) return user?.cooperativaId;
  if (!isAppDataWarm()) return user.cooperativaId;
  const data = getData();
  return getUserCooperativaId(user as User, data) ?? user.cooperativaId;
}

/** Persistido para exibição no piloto — ignora filtro de build (purge pós-deploy). */
export function cooperadoPilotInicioCardPersistidoExibicao(
  cooperadoId: string,
  cooperativaId?: string
): InicioCardMotorSnapshot | null {
  if (!isCooperadoMobilePilotPerfActive()) return null;
  const raw = lerInicioCardPersistidoFlex(cooperadoId, cooperativaId);
  if (!raw?.display) return null;
  const display = sanitizeInicioCardSnapshotFluxoBic(raw.display);
  if (!cooperadoMotorTemObrigacaoReceber(display)) return null;
  return display;
}

/**
 * Leitura O(local) do card Início — paridade Financeiro, sem gate de snapshot/build.
 * Só piloto + AppData warm com fatia financeira mínima.
 */
export function cooperadoPilotCardInicioFromAppDataLocal(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string
): InicioCardMotorSnapshot | null {
  if (!isCooperadoMobilePilotPerfActive()) return null;
  const canon = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  if (!cooperadoTemDadosFinanceirosMinimos(data, canon, cooperativaId)) return null;
  const { motor } = resolverMotorCardInicioParidadeFinanceiro(data, canon, cooperativaId);
  return sanitizeInicioCardSnapshotFluxoBic(motor);
}

export function cooperadoPilotCardInicioLeituraRapida(
  cooperadoId: string | undefined,
  cooperativaId: string | undefined
): InicioCardMotorSnapshot | null {
  if (!cooperadoId || !isCooperadoMobilePilotPerfActive()) return null;
  if (isAppDataWarm()) {
    const coop = cooperativaId;
    if (coop) {
      const fromData = cooperadoPilotCardInicioFromAppDataLocal(getData(), cooperadoId, coop);
      if (fromData && cooperadoMotorTemObrigacaoReceber(fromData)) return fromData;
    }
  }
  return cooperadoPilotInicioCardPersistidoExibicao(cooperadoId, cooperativaId);
}
