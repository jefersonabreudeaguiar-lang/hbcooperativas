/**
 * A receber híbrido: ficha (conta_coop) + overlay local das compras HB.
 * A ficha ganha. Overlay só cobre o buraco até a linha gravar.
 * Nunca zera o lastro.
 */
import type { FichaCorridaDesconto } from "@/types";
import type { DescontoContaCoopRemoto } from "@/lib/hb-credit/mergeFichaDescontos";
import { dedupeDescontosContaCoopRemotos } from "@/lib/hb-credit/mergeFichaDescontos";
import type { LeituraFinanceiraParidadeCooperado } from "@/lib/cooperado/cooperadoFinanceiroParidadeUniversal";
import { valorLiquidoFromResumoPartes } from "@/services/notaPedidoService";
import { dispatchCooperadoPwaLeveUiSnapshotRefresh } from "@/lib/cooperado/cooperadoPwaLeveUiEvents";

export const HB_A_RECEBER_HIBRIDO_VERSION = 1;

const OVERLAY_KEY_PREFIX = "hb.coop.hbAReceberDebito.v1:";

export type DebitoHbHibridoFonte = "ficha" | "overlay" | "nenhum";

export type DebitoHbHibrido = {
  valorReais: number;
  linhas: DescontoContaCoopRemoto[];
  fonte: DebitoHbHibridoFonte;
};

export type OverlayDebitoHbAReceber = {
  v: number;
  cooperadoId: string;
  cooperativaId: string;
  mesReferencia: string;
  linhas: DescontoContaCoopRemoto[];
  savedAt: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function somarContaCoopReais(
  linhas: Array<{ tipo?: string; valorReais?: number; valor?: number }>
): number {
  let s = 0;
  for (const d of linhas) {
    if (d.tipo && d.tipo !== "conta_coop") continue;
    const v = Number(d.valorReais ?? d.valor ?? 0);
    if (Number.isFinite(v) && v > 0) s += v;
  }
  return round2(s);
}

export function escolherDebitoHbHibrido(opts: {
  linhasFicha: DescontoContaCoopRemoto[] | Array<{ tipo?: string; valor?: number; valorReais?: number; motivo?: string }>;
  linhasOverlay: DescontoContaCoopRemoto[];
}): DebitoHbHibrido {
  const fichaRemotas = opts.linhasFicha
    .filter((d) => !d.tipo || d.tipo === "conta_coop")
    .map((d) => ({
      motivo: ("motivo" in d && d.motivo ? String(d.motivo) : "Compra HB Créditos") as string,
      valorReais: Number("valorReais" in d ? d.valorReais : d.valor) || 0,
      tipo: "conta_coop" as const,
      createdAt: "createdAt" in d && typeof d.createdAt === "string" ? d.createdAt : "",
      hbTransactionId:
        "hbTransactionId" in d && typeof d.hbTransactionId === "string" ? d.hbTransactionId : undefined,
    }));
  const ficha = somarContaCoopReais(fichaRemotas);
  const overlay = somarContaCoopReais(opts.linhasOverlay);
  if (ficha > 0.005) {
    return { valorReais: ficha, linhas: dedupeDescontosContaCoopRemotos(fichaRemotas), fonte: "ficha" };
  }
  if (overlay > 0.005) {
    return { valorReais: overlay, linhas: dedupeDescontosContaCoopRemotos(opts.linhasOverlay), fonte: "overlay" };
  }
  return { valorReais: 0, linhas: [], fonte: "nenhum" };
}

/** Lastros com valor: desconta HB. Se o desconto comeria o lastro, mantém o lastro. */
export function aplicarDebitoHbHibridoNoValor(valorLastro: number, debitoReais: number): number {
  const lastro = Number.isFinite(valorLastro) ? valorLastro : 0;
  const debito = Number.isFinite(debitoReais) ? debitoReais : 0;
  if (lastro <= 0.005 || debito <= 0.005) return lastro;
  const next = round2(lastro - debito);
  if (next <= 0.005) return lastro;
  return next;
}

export function linhasOverlayParaDescontosExtras(linhas: DescontoContaCoopRemoto[]): FichaCorridaDesconto[] {
  return dedupeDescontosContaCoopRemotos(linhas).map((d) => ({
    tipo: "conta_coop" as const,
    motivo: d.motivo,
    valor: d.valorReais,
  }));
}

export function mesclarDescontosExtrasComHbHibrido(
  extras: FichaCorridaDesconto[],
  debito: DebitoHbHibrido
): FichaCorridaDesconto[] {
  if (extras.some((d) => d.tipo === "conta_coop")) return extras;
  if (debito.fonte === "nenhum" || debito.valorReais <= 0.005) return extras;
  return [...extras, ...linhasOverlayParaDescontosExtras(debito.linhas)];
}

export function aplicarDebitoHbHibridoNaParidade(
  paridade: LeituraFinanceiraParidadeCooperado,
  overlayLinhas: DescontoContaCoopRemoto[]
): LeituraFinanceiraParidadeCooperado {
  const debito = escolherDebitoHbHibrido({
    linhasFicha: paridade.descontosExtras,
    linhasOverlay: overlayLinhas,
  });
  if (debito.fonte !== "overlay") return paridade;
  const extras = mesclarDescontosExtrasComHbHibrido(paridade.descontosExtras, debito);
  const valorEntregas = paridade.resumo?.valorEntregas ?? paridade.valorLiquido;
  const liquido = valorLiquidoFromResumoPartes(valorEntregas, extras);
  const seguro = liquido > 0.005 ? liquido : paridade.valorLiquido;
  return {
    ...paridade,
    descontosExtras: extras,
    valorLiquido: seguro,
    resumo: paridade.resumo
      ? { ...paridade.resumo, descontosExtras: extras, valorLiquido: seguro }
      : paridade.resumo,
    consolidado: {
      ...paridade.consolidado,
      valorLiquido: seguro,
      resumo: paridade.consolidado.resumo
        ? { ...paridade.consolidado.resumo, descontosExtras: extras, valorLiquido: seguro }
        : paridade.consolidado.resumo,
    },
  };
}

function overlayKey(cooperativaId: string, cooperadoId: string): string {
  return `${OVERLAY_KEY_PREFIX}${cooperativaId}:${cooperadoId}`;
}

export function gravarOverlayDebitoHbAReceber(payload: OverlayDebitoHbAReceber): void {
  if (typeof localStorage === "undefined") return;
  if (!payload.cooperadoId || !payload.cooperativaId) return;
  try {
    localStorage.setItem(
      overlayKey(payload.cooperativaId, payload.cooperadoId),
      JSON.stringify({ ...payload, v: HB_A_RECEBER_HIBRIDO_VERSION })
    );
    dispatchCooperadoPwaLeveUiSnapshotRefresh();
  } catch {
    /* quota */
  }
}

export function lerOverlayDebitoHbAReceber(
  cooperadoId: string,
  cooperativaId?: string
): OverlayDebitoHbAReceber | null {
  if (typeof localStorage === "undefined" || !cooperadoId) return null;
  try {
    if (cooperativaId) {
      const raw = localStorage.getItem(overlayKey(cooperativaId, cooperadoId));
      if (raw) {
        const parsed = JSON.parse(raw) as OverlayDebitoHbAReceber;
        if (parsed.v === HB_A_RECEBER_HIBRIDO_VERSION && Array.isArray(parsed.linhas)) return parsed;
      }
    }
    const suffix = `:${cooperadoId}`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(OVERLAY_KEY_PREFIX) || !key.endsWith(suffix)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as OverlayDebitoHbAReceber;
      if (parsed.v === HB_A_RECEBER_HIBRIDO_VERSION && Array.isArray(parsed.linhas)) return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

export function linhasOverlayDebitoHbAReceber(
  cooperadoId: string,
  cooperativaId?: string
): DescontoContaCoopRemoto[] {
  return lerOverlayDebitoHbAReceber(cooperadoId, cooperativaId)?.linhas ?? [];
}
