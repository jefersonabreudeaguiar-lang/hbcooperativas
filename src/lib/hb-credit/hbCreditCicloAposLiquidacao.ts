/**
 * Ciclo HB × ficha: compra já liquidada no PIX não volta no resumo.
 * A aba Limites já corta o utilizado quitado; Pagar / A receber / Financeiro
 * usam a mesma linha — para todo cooperado.
 */
import type { AppData, PagamentoCooperadoRegistro } from "@/types";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import {
  dedupeDescontosContaCoopRemotos,
  mesReferenciaFromIso,
  type DescontoContaCoopRemoto,
} from "@/lib/hb-credit/mergeFichaDescontos";

export type CicloHbPagamentoLiquidado = {
  meses: string[];
  mesMax: string;
  quitadoAteMs: number;
};

export type CicloHbLiquidado = {
  explicitTransactionIds: Set<string>;
  pagamentos: CicloHbPagamentoLiquidado[];
};

const CICLO_VAZIO: CicloHbLiquidado = {
  explicitTransactionIds: new Set(),
  pagamentos: [],
};

function mesesDoPagamento(p: PagamentoCooperadoRegistro): string[] {
  if (p.mesesReferencia?.length) return [...p.mesesReferencia].sort();
  return p.mesReferencia ? [p.mesReferencia] : [];
}

function quitadoAteMs(p: PagamentoCooperadoRegistro): number {
  const iso = p.assinadoEm ?? p.updatedAt ?? p.pagoEm ?? p.createdAt;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
}

function pagamentoLiquidaCicloHb(p: PagamentoCooperadoRegistro): boolean {
  /** PIX aguardando assinatura ainda não liquidou o ciclo HB — compras do mês continuam no líquido. */
  return p.status === "confirmado";
}

export function coletarCicloHbLiquidado(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): CicloHbLiquidado {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  const explicitTransactionIds = new Set<string>();
  const pagamentos: CicloHbPagamentoLiquidado[] = [];

  for (const p of data.pagamentosCooperado ?? []) {
    if (!pagamentoLiquidaCicloHb(p)) continue;
    if (coopId && p.cooperativaId && p.cooperativaId !== coopId) continue;
    const pCanon = resolverCooperadoIdCanonico(data, p.cooperadoId, p.cooperativaId ?? coopId);
    if (p.cooperadoId !== cooperadoId && p.cooperadoId !== canonico && pCanon !== canonico) {
      continue;
    }
    const ate = quitadoAteMs(p);
    const meses = mesesDoPagamento(p);
    if (!meses.length || !Number.isFinite(ate)) continue;
    for (const d of p.descontosExtras ?? []) {
      const id = (d as { hbTransactionId?: string }).hbTransactionId?.trim();
      if (id) explicitTransactionIds.add(id);
    }
    pagamentos.push({
      meses,
      mesMax: meses[meses.length - 1]!,
      quitadoAteMs: ate,
    });
  }

  if (!pagamentos.length && !explicitTransactionIds.size) return CICLO_VAZIO;
  return { explicitTransactionIds, pagamentos };
}

/** Compra ainda pode abater a ficha em aberto — mesma ideia do utilizado na aba Limites. */
export function compraHbPertenceCicloAberto(
  d: DescontoContaCoopRemoto,
  ciclo: CicloHbLiquidado
): boolean {
  const id = d.hbTransactionId?.trim();
  if (id && ciclo.explicitTransactionIds.has(id)) return false;

  const createdMs = Date.parse(d.createdAt ?? "");
  const txMes = mesReferenciaFromIso(d.createdAt);

  for (const p of ciclo.pagamentos) {
    if (!Number.isFinite(createdMs) || createdMs > p.quitadoAteMs) continue;
    if (!txMes) return false;
    if (p.meses.includes(txMes)) return false;
    if (txMes > p.mesMax) return false;
  }
  return true;
}

export function filtrarDescontosContaCoopAposLiquidacao(
  descontos: DescontoContaCoopRemoto[],
  ciclo: CicloHbLiquidado
): DescontoContaCoopRemoto[] {
  const deduped = dedupeDescontosContaCoopRemotos(descontos);
  if (!ciclo.pagamentos.length && !ciclo.explicitTransactionIds.size) return deduped;
  return deduped.filter((d) => compraHbPertenceCicloAberto(d, ciclo));
}
