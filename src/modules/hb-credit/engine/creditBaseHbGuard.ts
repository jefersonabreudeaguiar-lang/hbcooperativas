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
import { computeDisponivel } from "./money";

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
  creditoBaseCents: number,
  /** AppData já passado por prepararAppDataParaCreditoBaseHb — evita reconciliar ficha N vezes. */
  prepared?: AppData
): number {
  const cents = Math.max(0, Math.round(Number(creditoBaseCents) || 0));
  if (cents <= 0) return 0;

  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const sane = prepared ?? prepararAppDataParaCreditoBaseHb(data);

  if (!cooperadoTemEntregasConferidasParaHb(sane, cooperadoId, coopId)) {
    return 0;
  }
  if (coopId && cooperadoFichaValoresDesalinhados(sane, cooperadoId, coopId)) {
    return 0;
  }

  return cents;
}

/**
 * Limite HB efetivo para UI/API — autoridade = limit_released_cents no Supabase.
 * Teto percentual só reduz acima do liberado (anti-inflação); quitou “A receber” não zera limite.
 */
export function resolveLimiteHbCooperadoEfetivo(
  limite: ContaCoopLimiteCooperado,
  creditoBaseAuthoritativeCents: number,
  tetoPercent: number
): ContaCoopLimiteCooperado {
  const released = Math.max(0, Math.round(limite.limiteLiberadoCents));
  const usado = Math.max(0, Math.round(limite.valorUsadoCents));
  const base = Math.max(0, Math.round(creditoBaseAuthoritativeCents));

  let effectiveReleased = released;

  if (
    base > 0 &&
    Number.isFinite(tetoPercent) &&
    tetoPercent > 0 &&
    tetoPercent <= 100
  ) {
    const maxLimite = calcLimiteFromPercentual(base, tetoPercent);
    effectiveReleased = Math.min(released, maxLimite);
  }

  return {
    ...limite,
    limiteLiberadoCents: effectiveReleased,
    valorDisponivelCents: computeDisponivel(effectiveReleased, usado),
  };
}

/** @deprecated alias — use resolveLimiteHbCooperadoEfetivo */
export function capContaCoopLimiteToAuthoritativeBase(
  limite: ContaCoopLimiteCooperado,
  creditoBaseAuthoritativeCents: number,
  tetoPercent: number
): ContaCoopLimiteCooperado {
  return resolveLimiteHbCooperadoEfetivo(limite, creditoBaseAuthoritativeCents, tetoPercent);
}

export function blindarMapaCreditoBaseCentsHb(
  data: AppData,
  cooperativaId: string | undefined,
  creditosBaseCents: Record<string, number>
): Record<string, number> {
  const sane = prepararAppDataParaCreditoBaseHb(data);
  const out: Record<string, number> = {};
  for (const [cooperadoId, value] of Object.entries(creditosBaseCents)) {
    out[cooperadoId] = blindarCreditoBaseCentsHb(sane, cooperadoId, cooperativaId, value, sane);
  }
  return out;
}
