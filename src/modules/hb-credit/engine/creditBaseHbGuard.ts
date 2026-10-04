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
import { projetarAppDataFinanceiroParaCreditoBase } from "./projetarAppDataFinanceiroParaCreditoBase";
import { calcLimiteFromPercentual } from "./creditBaseFromFicha";
import type { ContaCoopLimiteCooperado } from "../types";
import { computeDisponivel } from "./money";

/** Remove fichas sem nota conferida/paga (após projeção financeira — não reconciliar de novo). */
function filtrarFichasConferidasCreditoBaseHb(data: AppData): AppData {
  let next = purgarFichasInvalidas(data);
  const fichaCorrida = next.fichaCorrida.filter((f) => {
    const nota = next.notasPedido.find((n) => n.id === f.notaPedidoId);
    if (!nota) return false;
    if (nota.status !== "conferida" && nota.status !== "pago") return false;
    return true;
  });
  if (fichaCorrida.length === next.fichaCorrida.length) return next;
  return { ...next, fichaCorrida };
}

/** Remove fichas que não têm nota conferida/paga — crédito HB exige entrega real. */
export function purgarFichasParaCreditoBaseCloud(data: AppData): AppData {
  return filtrarFichasConferidasCreditoBaseHb(reconciliarFichaFromNotasConferidas(data));
}

/** App local/servidor: projeção financeira M6 + higiene de ficha para crédito-base HB. */
export function prepararAppDataParaCreditoBaseHb(data: AppData, cnpj?: string): AppData {
  return filtrarFichasConferidasCreditoBaseHb(projetarAppDataFinanceiroParaCreditoBase(data, cnpj));
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
 * Limite HB efetivo para UI/API — percentual sobre o bruto da ficha em aberto.
 * Sem base em aberto (mês liquidado), liberado exibido = no máximo o já utilizado (compras HB).
 */
export function resolveLimiteHbCooperadoEfetivo(
  limite: ContaCoopLimiteCooperado,
  creditoBaseAuthoritativeCents: number,
  tetoPercent: number,
  liberacaoPercent?: number | null
): ContaCoopLimiteCooperado {
  const released = Math.max(0, Math.round(limite.limiteLiberadoCents));
  const usado = Math.max(0, Math.round(limite.valorUsadoCents));
  const base = Math.max(0, Math.round(creditoBaseAuthoritativeCents));

  let effectiveReleased = released;

  if (base === 0) {
    effectiveReleased = Math.min(released, usado);
  } else {
    const tetoPct =
      Number.isFinite(tetoPercent) && tetoPercent > 0 && tetoPercent <= 100 ? tetoPercent : 100;
    const libPct =
      liberacaoPercent != null &&
      Number.isFinite(liberacaoPercent) &&
      liberacaoPercent > 0 &&
      liberacaoPercent <= 100
        ? liberacaoPercent
        : tetoPct;
    const releasePct = Math.min(tetoPct, libPct);
    const capCents = calcLimiteFromPercentual(base, releasePct);
    effectiveReleased = Math.min(released, capCents);
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
  tetoPercent: number,
  liberacaoPercent?: number | null
): ContaCoopLimiteCooperado {
  return resolveLimiteHbCooperadoEfetivo(
    limite,
    creditoBaseAuthoritativeCents,
    tetoPercent,
    liberacaoPercent
  );
}

function findContaHbParaCooperadoId(
  contas: ContaCoopLimiteCooperado[],
  cooperadoId: string,
  resolverCanonico: (id: string) => string
): ContaCoopLimiteCooperado | undefined {
  const direct = contas.find((l) => l.cooperadoId === cooperadoId);
  if (direct) return direct;
  const canon = resolverCanonico(cooperadoId);
  const byCanon = contas.find((l) => l.cooperadoId === canon);
  if (byCanon) return byCanon;
  return contas.find((l) => resolverCanonico(l.cooperadoId) === canon);
}

/** Alinha linhas da aba Limites aos ids solicitados (UI local) com contas HB por titular/canônico. */
export function projetarLimitesListaCooperados(
  contasCapadas: ContaCoopLimiteCooperado[],
  cooperadoIds: string[],
  creditosBaseCents: Record<string, number>,
  tetoPercent: number,
  resolverCanonico: (id: string) => string,
  liberacaoPercent?: number | null
): ContaCoopLimiteCooperado[] {
  if (!cooperadoIds.length) return contasCapadas;
  const consumidas = new Set<string>();
  const out: ContaCoopLimiteCooperado[] = [];

  for (const id of cooperadoIds) {
    const conta = findContaHbParaCooperadoId(contasCapadas, id, resolverCanonico);
    if (!conta) continue;
    consumidas.add(conta.id);
    const canon = resolverCanonico(id);
    const base = Math.max(
      creditosBaseCents[id] ?? 0,
      creditosBaseCents[conta.cooperadoId] ?? 0,
      creditosBaseCents[canon] ?? 0
    );
    out.push(
      resolveLimiteHbCooperadoEfetivo({ ...conta, cooperadoId: id }, base, tetoPercent, liberacaoPercent)
    );
  }

  for (const row of contasCapadas) {
    if (!consumidas.has(row.id)) out.push(row);
  }
  return out;
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
