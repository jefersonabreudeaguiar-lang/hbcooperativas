/**
 * BIC — leitura central cooperado (proposta BIC / B4 LAB).
 * Toda UI cooperado deve importar valor a receber daqui quando B4 LAB está ativo.
 * Motores legados ficam encapsulados neste módulo (aposentados como entry points diretos na UI).
 */
import type { AppData } from "@/types";
import type { BicExibicaoEnvelope } from "@/types/bic";
import { isBicCentralReadAuthorityEnabled } from "@/lib/bic/bicCentralReadAuthority";
import {
  getInicioCooperadoParaExibicao,
  getPainelQuantoVouReceberCooperadoParaExibicao,
  getProjecaoFinanceiraCooperadoBIC,
  getQuantoVouReceberCooperadoParaExibicao,
  type BicProjecaoFinanceiraCooperado,
  type BicProjecaoFinanceiraCooperadoOpts,
} from "@/services/bicProjecaoFinanceiraCooperado";
import {
  getConsolidadoFinanceiroCooperadoMotorLegado,
  getMesPrincipalQuantoVouReceber,
  getResumoQuantoVouReceberCooperado,
  getValorQuantoVouReceber,
  getValorQuantoVouReceberMotorLegado,
  listarMesesComValorQuantoVouReceber,
  listarMesesPendentesQuantoVouReceber,
  listarResumosMensaisEntregas,
  getResumoMesEntregasCooperado,
  type ConsolidadoFinanceiroCooperado,
  type EstadoQuantoVouReceberCooperado,
  type ResumoMesEntregasCooperado,
} from "@/services/cooperadoEntregasService";
import {
  getResumoPagamentoConsolidadoCooperado,
  getResumoPagamentoExibicao,
  type AjustesResumoPagamento,
} from "@/services/notaPedidoService";
import { formatMesesReferenciaRotulo } from "@/utils/format";
import {
  cooperadoInicioParaCardsDefinitivos,
  cooperadoQuantoVouReceberParaApresentacao,
} from "@/lib/cooperadoApresentacaoFinanceira";

export type BicCentralProjecaoOpts = BicProjecaoFinanceiraCooperadoOpts & {
  apresentacaoConsolidada?: boolean;
};

/** LAB B4: enquanto houver pendência financeira, não mascarar valores no sync (H203). */
function cooperadoTemPendenciaFinanceiraVisivel(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined
): boolean {
  const raw = getValorQuantoVouReceberMotorLegado(data, cooperadoId, cooperativaId);
  if (isBicCentralReadAuthorityEnabled()) return raw.valor > 0;
  return raw.valor > 0 || raw.aguardandoAssinatura || raw.valorRecibo > 0;
}

function effectiveApresentacaoConsolidada(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts?: Pick<BicCentralProjecaoOpts, "apresentacaoConsolidada">
): boolean {
  if (isBicCentralReadAuthorityEnabled() && cooperadoTemPendenciaFinanceiraVisivel(data, cooperadoId, cooperativaId)) {
    return true;
  }
  if (opts?.apresentacaoConsolidada === false) return false;
  return opts?.apresentacaoConsolidada ?? true;
}

function painelOptsComValorPersistente(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts?: BicCentralProjecaoOpts
): BicCentralProjecaoOpts | undefined {
  if (!opts || !isBicCentralReadAuthorityEnabled()) return opts;
  const raw = getValorQuantoVouReceberMotorLegado(data, cooperadoId, cooperativaId);
  if (raw.valor <= 0 && !raw.aguardandoAssinatura) return opts;
  return {
    ...opts,
    financeiroSincronizando: false,
    carregandoNuvem: false,
    apresentacaoConsolidada: effectiveApresentacaoConsolidada(data, cooperadoId, cooperativaId, opts),
  };
}

function apresentacao(opts?: BicCentralProjecaoOpts): boolean {
  return opts?.apresentacaoConsolidada !== false;
}

/** Rótulo (ex. “Setembro 2026”) sempre derivado dos meses que compõem o valor a receber. */
export function bicCentralSincronizarRotuloMeses<T extends ReturnType<typeof getValorQuantoVouReceber>>(
  raw: T
): T {
  const mesesCanon =
    raw.meses.length > 0 ? [...raw.meses].sort() : raw.mes ? [raw.mes] : [];
  if (mesesCanon.length === 0) return raw;
  const mesLabel = formatMesesReferenciaRotulo(mesesCanon);
  const mes = mesesCanon[mesesCanon.length - 1]!;
  return {
    ...raw,
    meses: mesesCanon,
    mes,
    mesLabel,
  };
}

/** Snapshot BIC completo — centro lógico da proposta. */
export function bicCentralProjecaoFinanceira(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts?: BicCentralProjecaoOpts
): BicProjecaoFinanceiraCooperado {
  return getProjecaoFinanceiraCooperadoBIC(data, cooperadoId, cooperativaId, opts);
}

export function bicCentralInicioParaExibicao(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts?: Pick<BicCentralProjecaoOpts, "apresentacaoConsolidada">
): BicExibicaoEnvelope<ReturnType<typeof getInicioCooperadoParaExibicao>["value"]> {
  const consolidated = effectiveApresentacaoConsolidada(data, cooperadoId, cooperativaId, opts);
  if (!isBicCentralReadAuthorityEnabled()) {
    return getInicioCooperadoParaExibicao(data, cooperadoId, cooperativaId, {
      apresentacaoConsolidada: consolidated,
    });
  }
  const raw = bicCentralNormalizarValorM6(
    bicCentralSincronizarRotuloMeses(getValorQuantoVouReceberMotorLegado(data, cooperadoId, cooperativaId))
  );
  if (raw.valor > 0) {
    return {
      value: cooperadoInicioParaCardsDefinitivos(
        {
          exibir: true,
          mes: raw.mes,
          meses: raw.meses,
          mesLabel: raw.mesLabel,
          valor: raw.valor,
          valorRecibo: 0,
          aguardandoAssinatura: false,
        },
        consolidated
      ),
      observability: { source: "bic", fallback: false, bicProjectionAuthorized: true },
    };
  }
  return {
    value: cooperadoInicioParaCardsDefinitivos(
      {
        exibir: false,
        mes: raw.mes,
        meses: raw.meses,
        mesLabel: raw.mesLabel,
        valor: 0,
        valorRecibo: 0,
        aguardandoAssinatura: false,
      },
      consolidated
    ),
    observability: { source: "bic", fallback: false, bicProjectionAuthorized: true },
  };
}

export function bicCentralQuantoVouReceberParaExibicao(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts?: Pick<BicCentralProjecaoOpts, "apresentacaoConsolidada">
): BicExibicaoEnvelope<ReturnType<typeof getValorQuantoVouReceber>> {
  const consolidated = effectiveApresentacaoConsolidada(data, cooperadoId, cooperativaId, opts);
  if (!isBicCentralReadAuthorityEnabled()) {
    return getQuantoVouReceberCooperadoParaExibicao(data, cooperadoId, cooperativaId, {
      apresentacaoConsolidada: consolidated,
    });
  }
  const raw = bicCentralSincronizarRotuloMeses(getValorQuantoVouReceberMotorLegado(data, cooperadoId, cooperativaId));
  const normalized = bicCentralNormalizarValorM6(raw);
  const value = cooperadoQuantoVouReceberParaApresentacao(normalized, consolidated);
  return {
    value,
    observability: { source: "bic", fallback: false, bicProjectionAuthorized: true },
  };
}

function bicCentralNormalizarValorM6(
  raw: ReturnType<typeof getValorQuantoVouReceber>
): ReturnType<typeof getValorQuantoVouReceber> {
  if (!isBicCentralReadAuthorityEnabled()) return raw;
  /** Só valor líquido pendente na ficha — nunca valorRecibo (PIX já registrado / recibo). */
  return {
    ...raw,
    valor: raw.valor > 0 ? raw.valor : 0,
    valorRecibo: 0,
    aguardandoAssinatura: false,
  };
}

/** Quanto vou receber — UI LAB/BIC: sempre “Total a receber”, sem modo recibo/assinar. */
export function bicCentralResumoQuantoVouReceberCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts?: BicCentralProjecaoOpts
): ReturnType<typeof getResumoQuantoVouReceberCooperado> {
  const carregando = Boolean(opts?.carregandoNuvem || opts?.financeiroSincronizando);
  const m6 = bicCentralSincronizarRotuloMeses(
    bicCentralValorAReceberAgregado(data, cooperadoId, cooperativaId, opts)
  );

  if (carregando) {
    return {
      estado: "carregando",
      mesLabel: m6.mesLabel,
      valorDestaque: 0,
      valorRecibo: 0,
      aguardandoAssinatura: false,
      valorAberto: m6.valor,
      tituloValor: "Atualizando",
      subtitulo: "Baixando pagamentos e valores da cooperativa…",
      acaoRotulo: null,
    };
  }

  const valorDestaque = m6.valor > 0 ? m6.valor : 0;
  if (valorDestaque > 0) {
    return {
      estado: "a_receber",
      mesLabel: m6.mesLabel,
      valorDestaque,
      valorRecibo: 0,
      aguardandoAssinatura: false,
      valorAberto: m6.valor,
      tituloValor: "Total a receber",
      subtitulo: "Valor líquido das entregas conferidas (antes do pagamento da cooperativa).",
      acaoRotulo: null,
    };
  }

  return {
    estado: "nada_pendente",
    mesLabel: m6.mesLabel,
    valorDestaque: 0,
    valorRecibo: 0,
    aguardandoAssinatura: false,
    valorAberto: 0,
    tituloValor: "Nada a receber agora",
    subtitulo: "Quando a cooperativa aprovar suas entregas, o valor aparece aqui.",
    acaoRotulo: null,
  };
}

export function bicCentralPainelQuantoVouReceberParaExibicao(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts?: BicCentralProjecaoOpts
): BicExibicaoEnvelope<ReturnType<typeof getResumoQuantoVouReceberCooperado>> {
  const optsEff = painelOptsComValorPersistente(data, cooperadoId, cooperativaId, opts);
  if (isBicCentralReadAuthorityEnabled()) {
    const proj = getProjecaoFinanceiraCooperadoBIC(data, cooperadoId, cooperativaId, optsEff);
    const value = bicCentralResumoQuantoVouReceberCooperado(data, cooperadoId, cooperativaId, optsEff);
    if (proj.bicProjectionAuthorized) {
      return { value, observability: { source: "bic", fallback: false, bicProjectionAuthorized: true } };
    }
  }
  return getPainelQuantoVouReceberCooperadoParaExibicao(data, cooperadoId, cooperativaId, optsEff);
}

/** Valor agregado M6 — único número “a receber” no LAB B4. */
export function bicCentralValorAReceberAgregado(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts?: Pick<BicCentralProjecaoOpts, "apresentacaoConsolidada">
): ReturnType<typeof getValorQuantoVouReceber> {
  const envelope = bicCentralQuantoVouReceberParaExibicao(data, cooperadoId, cooperativaId, opts);
  return bicCentralSincronizarRotuloMeses(bicCentralNormalizarValorM6(envelope.value));
}

export function bicCentralAguardandoAssinatura(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts?: Pick<BicCentralProjecaoOpts, "apresentacaoConsolidada">
): boolean {
  return bicCentralValorAReceberAgregado(data, cooperadoId, cooperativaId, opts).aguardandoAssinatura;
}

export function bicCentralMesPrincipalQuantoVouReceber(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts?: Pick<BicCentralProjecaoOpts, "apresentacaoConsolidada">
): string {
  if (isBicCentralReadAuthorityEnabled()) {
    const v = bicCentralValorAReceberAgregado(data, cooperadoId, cooperativaId, opts);
    return v.mes || v.meses[v.meses.length - 1] || getMesPrincipalQuantoVouReceber(data, cooperadoId, cooperativaId);
  }
  return getMesPrincipalQuantoVouReceber(data, cooperadoId, cooperativaId);
}

export function bicCentralListarMesesPendentesQuantoVouReceber(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts?: Pick<BicCentralProjecaoOpts, "apresentacaoConsolidada">
): string[] {
  if (isBicCentralReadAuthorityEnabled()) {
    const v = bicCentralValorAReceberAgregado(data, cooperadoId, cooperativaId, opts);
    return v.meses.length > 0 ? [...v.meses] : v.mes ? [v.mes] : [];
  }
  return listarMesesPendentesQuantoVouReceber(data, cooperadoId, cooperativaId);
}

/** Compat: fora do LAB B4 delega legado; dentro usa BIC central. */
export function bicCentralResolveValorQuantoVouReceber(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts?: Pick<BicCentralProjecaoOpts, "apresentacaoConsolidada">
): ReturnType<typeof getValorQuantoVouReceber> {
  if (isBicCentralReadAuthorityEnabled()) {
    return bicCentralValorAReceberAgregado(data, cooperadoId, cooperativaId, opts);
  }
  return getValorQuantoVouReceber(data, cooperadoId, cooperativaId);
}

export function bicCentralResolveInicioParaExibicao(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts?: Pick<BicCentralProjecaoOpts, "apresentacaoConsolidada">
): ReturnType<typeof getInicioCooperadoParaExibicao>["value"] {
  const consolidated = effectiveApresentacaoConsolidada(data, cooperadoId, cooperativaId, opts);
  const optsEff = { ...opts, apresentacaoConsolidada: consolidated };
  const m6 = bicCentralValorAReceberAgregado(data, cooperadoId, cooperativaId, optsEff);

  if (isBicCentralReadAuthorityEnabled()) {
    const raw = bicCentralNormalizarValorM6(
      bicCentralSincronizarRotuloMeses(getValorQuantoVouReceberMotorLegado(data, cooperadoId, cooperativaId))
    );
    const valor = raw.valor > 0 ? raw.valor : m6.valor;
    const mes = raw.valor > 0 ? raw.mes : m6.mes;
    const meses = raw.valor > 0 ? raw.meses : m6.meses;
    const mesLabel = raw.valor > 0 ? raw.mesLabel : m6.mesLabel;
    if (valor > 0) {
      return cooperadoInicioParaCardsDefinitivos(
        {
          exibir: true,
          mes,
          meses,
          mesLabel,
          valor,
          valorRecibo: 0,
          aguardandoAssinatura: false,
        },
        consolidated
      );
    }
    return cooperadoInicioParaCardsDefinitivos(
      {
        exibir: false,
        mes: m6.mes || raw.mes,
        meses: m6.meses.length ? m6.meses : raw.meses,
        mesLabel: m6.mesLabel || raw.mesLabel,
        valor: 0,
        valorRecibo: 0,
        aguardandoAssinatura: false,
      },
      consolidated
    );
  }

  const inicio = getInicioCooperadoParaExibicao(data, cooperadoId, cooperativaId, optsEff).value;

  const merged = cooperadoInicioParaCardsDefinitivos(
    { ...inicio, mes: m6.mes, meses: m6.meses, mesLabel: m6.mesLabel },
    consolidated
  );
  const valorM6 = m6.valor > 0 ? m6.valor : 0;
  return {
    ...merged,
    valorRecibo: 0,
    aguardandoAssinatura: m6.aguardandoAssinatura,
    exibir: valorM6 > 0 && !m6.aguardandoAssinatura,
    valor: valorM6,
  };
}

export function bicCentralResolvePainelParaExibicao(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts?: BicCentralProjecaoOpts
): ReturnType<typeof getResumoQuantoVouReceberCooperado> {
  const painel = isBicCentralReadAuthorityEnabled()
    ? bicCentralPainelQuantoVouReceberParaExibicao(data, cooperadoId, cooperativaId, opts).value
    : getPainelQuantoVouReceberCooperadoParaExibicao(data, cooperadoId, cooperativaId, opts).value;
  const m6 = bicCentralValorAReceberAgregado(data, cooperadoId, cooperativaId, opts);
  return { ...painel, mesLabel: m6.mesLabel };
}

/** Pendência financeira visível na UI cooperado (BIC: só valor líquido aberto na ficha). */
export function bicCentralCooperadoTemValorPendente(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): boolean {
  return bicCentralResolveValorQuantoVouReceber(data, cooperadoId, cooperativaId).valor > 0;
}

/** Consolidado ficha/início — delega legado; com BIC sobrescreve totais e desliga recibo. */
export function bicCentralGetConsolidadoFinanceiroCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string,
  ajustesPorMes?: Record<string, AjustesResumoPagamento>
): ConsolidadoFinanceiroCooperado {
  if (!isBicCentralReadAuthorityEnabled()) {
    return getConsolidadoFinanceiroCooperadoMotorLegado(data, cooperadoId, cooperativaId, ajustesPorMes);
  }

  const m6 = bicCentralValorAReceberAgregado(data, cooperadoId, cooperativaId);
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const mesesPendentes = bicCentralListarMesesPendentesQuantoVouReceber(data, cooperadoId, cooperativaId);
  const mesReferenciaPrincipal = bicCentralMesPrincipalQuantoVouReceber(data, cooperadoId, cooperativaId);
  const mesesComValor =
    m6.meses.length > 0 ? [...m6.meses] : listarMesesComValorQuantoVouReceber(data, cooperadoId, cooperativaId);

  const resumoVazio: ConsolidadoFinanceiroCooperado["resumo"] = {
    valorBruto: 0,
    descontoCooperativa: 0,
    descontosExtras: [],
    valorEntregas: 0,
    valorLiquido: 0,
    fichaIds: [],
    notaPedidoIds: [],
  };

  let resumo = resumoVazio;
  if (m6.valor > 0) {
    if (mesesComValor.length === 1) {
      resumo = getResumoPagamentoExibicao(
        data,
        cooperadoId,
        mesesComValor[0]!,
        coopId,
        ajustesPorMes?.[mesesComValor[0]!]
      );
    } else if (mesesComValor.length > 1) {
      resumo = getResumoPagamentoConsolidadoCooperado(
        data,
        cooperadoId,
        mesesComValor,
        coopId,
        ajustesPorMes
      );
    }
    resumo = { ...resumo, valorLiquido: m6.valor };
  }

  return {
    meses: mesesPendentes.length > 0 ? mesesPendentes : mesesComValor,
    mesReferenciaPrincipal,
    mesLabel: m6.mesLabel,
    valorLiquido: m6.valor,
    aguardandoAssinatura: false,
    resumo,
  };
}

/** Resumo mensal notas/ficha — sem expor pagamento aguardando assinatura quando BIC UI. */
export function bicCentralGetResumoMesEntregasCooperado(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string
): ResumoMesEntregasCooperado {
  const base = getResumoMesEntregasCooperado(data, cooperadoId, mesReferencia, cooperativaId);
  if (!isBicCentralReadAuthorityEnabled()) return base;
  return {
    ...base,
    pagamentoAguardando: undefined,
  };
}

export function bicCentralListarResumosMensaisEntregas(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): ResumoMesEntregasCooperado[] {
  if (!isBicCentralReadAuthorityEnabled()) {
    return listarResumosMensaisEntregas(data, cooperadoId, cooperativaId);
  }
  return listarResumosMensaisEntregas(data, cooperadoId, cooperativaId).map((r) =>
    bicCentralGetResumoMesEntregasCooperado(data, cooperadoId, r.mesReferencia, cooperativaId)
  );
}

export type { EstadoQuantoVouReceberCooperado, ConsolidadoFinanceiroCooperado, ResumoMesEntregasCooperado };
