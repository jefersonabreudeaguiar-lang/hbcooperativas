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
  listarMesesReferenciaResumoFinanceiroParidade,
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
  resumoComplementaresPosPagamento,
  valorLiquidoFromResumoPartes,
  type AjustesResumoPagamento,
} from "@/services/notaPedidoService";
import { formatMesesReferenciaRotulo } from "@/utils/format";
import {
  cooperadoInicioParaCardsDefinitivos,
  cooperadoQuantoVouReceberParaApresentacao,
} from "@/lib/cooperadoApresentacaoFinanceira";
import { cooperadoUsarFluxoReciboAssinaturaNaUi } from "@/lib/bic/cooperadoBicCentralUi";
import {
  leituraFinanceiraParidadeCooperado,
  type LeituraFinanceiraParidadeCooperado,
} from "@/lib/cooperado/cooperadoFinanceiroParidadeUniversal";

export type BicCentralProjecaoOpts = BicProjecaoFinanceiraCooperadoOpts & {
  apresentacaoConsolidada?: boolean;
};

/** LAB B4: enquanto houver pendência financeira, não mascarar valores no sync (H203). */
/** LAB B4 — respeita gate H203/H204; não força apresentação definitiva com sync incompleto. */
function effectiveApresentacaoConsolidada(
  _data: AppData,
  _cooperadoId: string,
  _cooperativaId: string | undefined,
  opts?: Pick<BicCentralProjecaoOpts, "apresentacaoConsolidada">
): boolean {
  if (opts?.apresentacaoConsolidada === false) return false;
  return opts?.apresentacaoConsolidada ?? true;
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
  const value = bicCentralResolveInicioParaExibicao(data, cooperadoId, cooperativaId, opts);
  return {
    value,
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
  const fluxoRecibo = cooperadoUsarFluxoReciboAssinaturaNaUi();
  const aguardando = fluxoRecibo && raw.aguardandoAssinatura && raw.valorRecibo > 0;
  return {
    ...raw,
    valor: raw.valor > 0 ? raw.valor : 0,
    valorRecibo: aguardando ? raw.valorRecibo : 0,
    aguardandoAssinatura: aguardando,
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

  if (
    cooperadoUsarFluxoReciboAssinaturaNaUi() &&
    m6.aguardandoAssinatura &&
    m6.valorRecibo > 0
  ) {
    return {
      estado: "aguardando_assinatura",
      mesLabel: m6.mesLabel,
      valorDestaque: m6.valorRecibo,
      valorRecibo: m6.valorRecibo,
      aguardandoAssinatura: true,
      valorAberto: m6.valor,
      tituloValor: "PIX registrado — falta assinar",
      subtitulo: "Confira o valor e confirme o recebimento assinando o recibo.",
      acaoRotulo: "Confirmar recebimento",
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
  const optsEff = opts;
  if (isBicCentralReadAuthorityEnabled()) {
    const proj = getProjecaoFinanceiraCooperadoBIC(data, cooperadoId, cooperativaId, optsEff);
    const value = bicCentralResumoQuantoVouReceberCooperado(data, cooperadoId, cooperativaId, optsEff);
    if (proj.bicProjectionAuthorized) {
      return { value, observability: { source: "bic", fallback: false, bicProjectionAuthorized: true } };
    }
  }
  return getPainelQuantoVouReceberCooperadoParaExibicao(data, cooperadoId, cooperativaId, optsEff);
}

/** Valor agregado M6 — padrão universal: mesma paridade do responsável (motor legado + meses ficha). */
function bicCentralValorAReceberFromParidadeUniversal(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined
): ReturnType<typeof getValorQuantoVouReceber> {
  const paridade = leituraFinanceiraParidadeCooperado(data, cooperadoId, cooperativaId);
  const reciboMotor = getValorQuantoVouReceberMotorLegado(data, cooperadoId, cooperativaId);
  const meses =
    paridade.mesesResumo.length > 0
      ? [...paridade.mesesResumo]
      : paridade.consolidado.meses.length > 0
        ? [...paridade.consolidado.meses]
        : reciboMotor.meses;
  const mes =
    meses[meses.length - 1] ??
    paridade.consolidado.mesReferenciaPrincipal ??
    reciboMotor.mes;
  const aguardandoRecibo =
    cooperadoUsarFluxoReciboAssinaturaNaUi() &&
    reciboMotor.aguardandoAssinatura &&
    reciboMotor.valorRecibo > 0;
  const valorExibir =
    aguardandoRecibo && paridade.valorLiquido <= 0
      ? 0
      : paridade.valorLiquido > 0
        ? paridade.valorLiquido
        : 0;
  return bicCentralSincronizarRotuloMeses(
    bicCentralNormalizarValorM6({
      mes,
      meses,
      mesLabel: paridade.mesLabel,
      valor: valorExibir,
      valorRecibo: reciboMotor.valorRecibo,
      aguardandoAssinatura: reciboMotor.aguardandoAssinatura,
    })
  );
}

/** Valor agregado M6 — único número “a receber” no LAB B4. */
export function bicCentralValorAReceberAgregado(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts?: Pick<BicCentralProjecaoOpts, "apresentacaoConsolidada">
): ReturnType<typeof getValorQuantoVouReceber> {
  if (isBicCentralReadAuthorityEnabled()) {
    return bicCentralValorAReceberFromParidadeUniversal(data, cooperadoId, cooperativaId);
  }
  const envelope = bicCentralQuantoVouReceberParaExibicao(data, cooperadoId, cooperativaId, opts);
  return bicCentralSincronizarRotuloMeses(bicCentralNormalizarValorM6(envelope.value));
}

/**
 * Paridade ficha/início/conta coop — mesma autoridade que CooperadoFinanceiroUiSnapshot (BIC ON).
 * UI cooperado deve preferir isto a `leituraFinanceiraParidadeCooperado` direto.
 */
export function bicCentralLeituraFinanceiraParidadeCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string,
  opts?: Pick<BicCentralProjecaoOpts, "apresentacaoConsolidada">
): LeituraFinanceiraParidadeCooperado {
  const paridade = leituraFinanceiraParidadeCooperado(data, cooperadoId, cooperativaId);
  if (!isBicCentralReadAuthorityEnabled()) return paridade;

  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const m6 = bicCentralValorAReceberAgregado(data, cooperadoId, coopId, opts);
  const inicio = bicCentralResolveInicioParaExibicao(data, cooperadoId, coopId, opts);
  const valorParidade = paridade.valorLiquido > 0.005 ? paridade.valorLiquido : 0;
  const valorInicio =
    inicio.exibir || inicio.valor > 0.005 ? Math.max(0, inicio.valor) : 0;
  const valorLiquido =
    valorParidade > 0
      ? valorParidade
      : Math.max(valorInicio, m6.valor > 0.005 ? m6.valor : 0);
  const mesesResumo =
    paridade.mesesResumo.length > 0
      ? [...paridade.mesesResumo]
      : m6.meses.length > 0
        ? [...m6.meses]
        : [...paridade.consolidado.meses];
  const mesLabel =
    paridade.mesLabel?.trim() || m6.mesLabel?.trim() || paridade.consolidado.mesLabel || "";
  const consolidado = bicCentralGetConsolidadoFinanceiroCooperado(data, cooperadoId, coopId);
  const resumo = { ...consolidado.resumo, valorLiquido };
  return {
    ...paridade,
    valorLiquido,
    mesesResumo,
    mesLabel,
    resumo,
    consolidado: {
      ...consolidado,
      valorLiquido,
      meses: mesesResumo,
      mesLabel,
      resumo,
    },
  };
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
    const paridade = leituraFinanceiraParidadeCooperado(data, cooperadoId, cooperativaId);
    const mesesPar =
      paridade.mesesResumo.length > 0 ? paridade.mesesResumo : paridade.consolidado.meses;
    const mesPar = mesesPar[mesesPar.length - 1] ?? m6.mes;
    const valor = paridade.valorLiquido > 0.005 ? paridade.valorLiquido : m6.valor > 0 ? m6.valor : 0;
    const modoRecibo =
      cooperadoUsarFluxoReciboAssinaturaNaUi() &&
      m6.aguardandoAssinatura &&
      m6.valorRecibo > 0 &&
      valor <= 0;
    if (valor > 0 || modoRecibo) {
      return cooperadoInicioParaCardsDefinitivos(
        {
          exibir: true,
          mes: mesPar,
          meses: mesesPar.length ? [...mesesPar] : m6.meses,
          mesLabel: paridade.mesLabel?.trim() || m6.mesLabel,
          valor,
          valorRecibo: modoRecibo ? m6.valorRecibo : 0,
          aguardandoAssinatura: modoRecibo,
        },
        consolidated
      );
    }
    return cooperadoInicioParaCardsDefinitivos(
      {
        exibir: false,
        mes: mesPar || m6.mes,
        meses: mesesPar.length ? [...mesesPar] : m6.meses,
        mesLabel: paridade.mesLabel?.trim() || m6.mesLabel,
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
    exibir: valorM6 > 0,
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
  const paridade = leituraFinanceiraParidadeCooperado(data, cooperadoId, cooperativaId);
  const mesLabel = paridade.mesLabel?.trim() || m6.mesLabel;
  const valorAberto =
    paridade.valorLiquido > 0.005 ? paridade.valorLiquido : m6.valor > 0 ? m6.valor : 0;
  if (valorAberto > 0 && painel.estado !== "carregando") {
    return {
      ...painel,
      estado: "a_receber",
      mesLabel,
      valorDestaque: valorAberto,
      valorAberto,
      tituloValor: painel.tituloValor || "Total a receber",
      subtitulo:
        painel.subtitulo ||
        "Valor líquido das entregas conferidas (antes do pagamento da cooperativa).",
    };
  }
  return { ...painel, mesLabel, valorAberto: valorAberto > 0 ? valorAberto : painel.valorAberto };
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

  if (!ajustesPorMes || Object.keys(ajustesPorMes).length === 0) {
    return leituraFinanceiraParidadeCooperado(data, cooperadoId, cooperativaId).consolidado;
  }

  const m6 = bicCentralValorAReceberAgregado(data, cooperadoId, cooperativaId);
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const mesesResumo = listarMesesReferenciaResumoFinanceiroParidade(data, cooperadoId, cooperativaId);
  const mesReferenciaPrincipal = bicCentralMesPrincipalQuantoVouReceber(data, cooperadoId, cooperativaId);
  const mesesComValor =
    mesesResumo.length > 0
      ? [...mesesResumo]
      : m6.meses.length > 0
        ? [...m6.meses]
        : listarMesesComValorQuantoVouReceber(data, cooperadoId, cooperativaId);
  const mesesPendentes = mesesComValor;

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
  } else if (mesesPendentes.length === 1) {
    resumo = getResumoPagamentoExibicao(
      data,
      cooperadoId,
      mesesPendentes[0]!,
      coopId,
      ajustesPorMes?.[mesesPendentes[0]!]
    );
  } else if (mesReferenciaPrincipal) {
    resumo = getResumoPagamentoExibicao(
      data,
      cooperadoId,
      mesReferenciaPrincipal,
      coopId,
      ajustesPorMes?.[mesReferenciaPrincipal]
    );
  }

  const valorLiquidoResumo = valorLiquidoFromResumoPartes(resumo.valorEntregas, resumo.descontosExtras);
  const valorLiquidoExibir =
    mesesComValor.length > 0 ? valorLiquidoResumo : m6.valor > 0 ? m6.valor : valorLiquidoResumo;
  resumo = { ...resumo, valorLiquido: valorLiquidoExibir };

  return {
    meses: mesesPendentes.length > 0 ? mesesPendentes : mesesComValor,
    mesReferenciaPrincipal,
    mesLabel: m6.mesLabel,
    valorLiquido: valorLiquidoExibir,
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
