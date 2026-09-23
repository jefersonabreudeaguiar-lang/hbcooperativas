import type { AppData } from "@/types";
import {
  notaPertenceCooperado,
  resolverCooperadoIdCanonico,
} from "@/services/cooperadoCloudService";
import { cooperadoFichaValoresDesalinhados } from "@/services/fichaSyncGuard";
import {
  purgarFichasInvalidas,
  reconciliarFichaFromNotasConferidas,
} from "@/services/notaPedidoService";
import { calcLimiteFromPercentual } from "./creditBaseFromFicha";
import type { ContaCoopLimiteCooperado } from "../types";

function computeDisponivel(limiteCents: number, usadoCents: number): number {
  return Math.max(0, Math.round(limiteCents) - Math.round(usadoCents));
}

/** Remove fichas que não têm nota conferida/paga — crédito HB exige entrega real. */
export function purgarFichasParaCreditoBaseCloud(data: AppData): AppData {
  let next = purgarFichasInvalidas(reconciliarFichaFromNotasConferidas(data));
  const fichaCorrida = next.fichaCorrida.filter((f) => {
    const nota = next.notasPedido.find((n) => n.id === f.notaPedidoId);
    if (!nota) return false;
    if (nota.status !== "conferida" && nota.status !== "pago") return false;
    return true;
  });
  if (fichaCorrida.length === next.fichaCorrida.length) return next;
  return { ...next, fichaCorrida };
}

/** App local: mesma higiene, sem preservar ficha órfã aguardando nota (evita crédito fantasma). */
export function prepararAppDataParaCreditoBaseHb(data: AppData): AppData {
  return purgarFichasParaCreditoBaseCloud(data);
}

export function cooperadoTemEntregasConferidasParaHb(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): boolean {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  return (data.notasPedido ?? []).some((n) => {
    if (n.status !== "conferida" && n.status !== "pago") return false;
    if (!notaPertenceCooperado(data, n, canonico, coopId)) return false;
    if (n.valorLiquido > 0) return true;
    return (n.itens ?? []).some((i) => i.quantidade > 0);
  });
}

/**
 * Zera crédito-base HB quando não há entregas conferidas reais ou a ficha está desalinhada.
 * Fail-closed — vale para todas as cooperativas.
 */
export function blindarCreditoBaseCentsHb(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  creditoBaseCents: number
): number {
  const cents = Math.max(0, Math.round(Number(creditoBaseCents) || 0));
  if (cents <= 0) return 0;

  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const sane = prepararAppDataParaCreditoBaseHb(data);

  if (!cooperadoTemEntregasConferidasParaHb(sane, cooperadoId, coopId)) {
    return 0;
  }
  if (coopId && cooperadoFichaValoresDesalinhados(sane, cooperadoId, coopId)) {
    return 0;
  }

  return cents;
}

/** Limita o que o cooperado vê no HB ao teto derivado da base autoritativa (anti-crédito fantasma no DB). */
export function capContaCoopLimiteToAuthoritativeBase(
  limite: ContaCoopLimiteCooperado,
  creditoBaseAuthoritativeCents: number,
  tetoPercent: number
): ContaCoopLimiteCooperado {
  const usado = Math.max(0, Math.round(limite.valorUsadoCents));
  const base = Math.max(0, Math.round(creditoBaseAuthoritativeCents));

  if (base <= 0) {
    const cappedReleased = Math.min(Math.max(0, limite.limiteLiberadoCents), usado);
    return {
      ...limite,
      limiteLiberadoCents: cappedReleased,
      valorDisponivelCents: computeDisponivel(cappedReleased, usado),
    };
  }

  if (!Number.isFinite(tetoPercent) || tetoPercent <= 0 || tetoPercent > 100) {
    return limite;
  }

  const maxLimite = calcLimiteFromPercentual(base, tetoPercent);
  const cappedReleased = Math.min(Math.max(0, limite.limiteLiberadoCents), maxLimite);
  return {
    ...limite,
    limiteLiberadoCents: cappedReleased,
    valorDisponivelCents: computeDisponivel(cappedReleased, usado),
  };
}

export function blindarMapaCreditoBaseCentsHb(
  data: AppData,
  cooperativaId: string | undefined,
  creditosBaseCents: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [cooperadoId, value] of Object.entries(creditosBaseCents)) {
    out[cooperadoId] = blindarCreditoBaseCentsHb(data, cooperadoId, cooperativaId, value);
  }
  return out;
}
