import type { AppData } from "@/types";
import { fichaPertenceCooperado, resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import {
  fichaValidaNoExtrato,
  getResumoPagamentoCooperado,
  listarFichasExtratoCooperadoMes,
} from "@/services/notaPedidoService";
import { round2 } from "@/utils/calculations";
import { reaisToCents } from "../shared/money";

function sumDescontoContaCoopMes(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string
): number {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const cooperadoCanonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  let total = 0;

  for (const f of listarFichasExtratoCooperadoMes(data, cooperadoCanonico, mesReferencia, coopId)) {
    for (const d of f.descontosDetalhe ?? []) {
      if (d.tipo === "conta_coop" && d.valor > 0) total += d.valor;
    }
  }

  for (const p of data.pagamentosCooperado) {
    if (p.mesReferencia !== mesReferencia) continue;
    if (coopId && p.cooperativaId && p.cooperativaId !== coopId) continue;
    const pagCanonico = resolverCooperadoIdCanonico(data, p.cooperadoId, coopId);
    if (pagCanonico !== cooperadoCanonico) continue;
    for (const d of p.descontosExtras ?? []) {
      if (d.tipo === "conta_coop" && d.valor > 0) total += d.valor;
    }
  }

  return round2(total);
}

/**
 * Crédito base Conta Coop:
 * — meses com ficha pendente: valor a pagar (Quanto vou receber);
 * — meses já pagos em dinheiro: entregas conferidas menos compras Conta Coop do mês.
 */
export function getCreditoBaseContaCoopReais(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): number {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const cooperadoCanonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);

  const meses = [
    ...new Set(
      data.fichaCorrida
        .filter(
          (f) =>
            fichaPertenceCooperado(data, f, cooperadoCanonico, coopId) &&
            fichaValidaNoExtrato(data, f)
        )
        .map((f) => f.mesReferencia)
    ),
  ].sort();

  let total = 0;
  for (const mes of meses) {
    const fichas = listarFichasExtratoCooperadoMes(data, cooperadoCanonico, mes, coopId);
    if (!fichas.length) continue;

    if (fichas.some((f) => f.status === "pendente")) {
      total += getResumoPagamentoCooperado(data, cooperadoCanonico, mes, coopId).valorLiquido;
      continue;
    }

    const valorEntregas = round2(fichas.reduce((s, f) => s + f.valorLiquido, 0));
    const descontoContaCoop = sumDescontoContaCoopMes(data, cooperadoCanonico, mes, coopId);
    total += round2(Math.max(0, valorEntregas - descontoContaCoop));
  }

  return round2(Math.max(0, total));
}

/** Crédito base do cooperado para limite Conta Coop (centavos). */
export function getCreditoBaseCooperadoCents(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): number {
  return reaisToCents(getCreditoBaseContaCoopReais(data, cooperadoId, cooperativaId));
}

export function buildCreditosBaseMap(
  data: AppData,
  cooperadoIds: string[],
  cooperativaId?: string
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const id of cooperadoIds) {
    map[id] = getCreditoBaseCooperadoCents(data, id, cooperativaId);
  }
  return map;
}

export function calcLimiteFromPercentual(creditoBaseCents: number, percentual: number): number {
  if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
    throw new Error("Percentual inválido (use 0 a 100).");
  }
  return Math.round(Math.max(0, creditoBaseCents) * (percentual / 100));
}

export function sumCreditosBaseCents(creditosBaseCents: Record<string, number>): number {
  return Object.values(creditosBaseCents).reduce(
    (total, value) => total + Math.max(0, Math.round(Number(value) || 0)),
    0
  );
}

/** Teto global em centavos = soma do percentual aplicado a cada cooperado (mesma regra da liberação coletiva). */
export function calcTetoGlobalCents(
  creditosBaseCents: Record<string, number>,
  tetoPercent: number
): number {
  if (!Number.isFinite(tetoPercent) || tetoPercent <= 0 || tetoPercent > 100) {
    throw new Error("Configuração de teto percentual inválida ou ausente.");
  }
  let total = 0;
  for (const value of Object.values(creditosBaseCents)) {
    const base = Math.max(0, Math.round(Number(value) || 0));
    total += calcLimiteFromPercentual(base, tetoPercent);
  }
  return total;
}
