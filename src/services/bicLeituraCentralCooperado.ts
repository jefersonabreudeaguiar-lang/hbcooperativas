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
  getMesPrincipalQuantoVouReceber,
  getResumoQuantoVouReceberCooperado,
  getValorQuantoVouReceber,
  listarMesesPendentesQuantoVouReceber,
  type EstadoQuantoVouReceberCooperado,
} from "@/services/cooperadoEntregasService";
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
  const raw = getValorQuantoVouReceber(data, cooperadoId, cooperativaId);
  return raw.valor > 0 || raw.aguardandoAssinatura || raw.valorRecibo > 0;
}

function effectiveApresentacaoConsolidada(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts?: Pick<BicCentralProjecaoOpts, "apresentacaoConsolidada">
): boolean {
  if (opts?.apresentacaoConsolidada === false) return false;
  if (isBicCentralReadAuthorityEnabled() && cooperadoTemPendenciaFinanceiraVisivel(data, cooperadoId, cooperativaId)) {
    return true;
  }
  return opts?.apresentacaoConsolidada ?? true;
}

function painelOptsComValorPersistente(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts?: BicCentralProjecaoOpts
): BicCentralProjecaoOpts | undefined {
  if (!opts || !isBicCentralReadAuthorityEnabled()) return opts;
  const raw = getValorQuantoVouReceber(data, cooperadoId, cooperativaId);
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
  const envelope = getInicioCooperadoParaExibicao(data, cooperadoId, cooperativaId, {
    apresentacaoConsolidada: consolidated,
  });
  if (!isBicCentralReadAuthorityEnabled()) return envelope;
  const raw = bicCentralSincronizarRotuloMeses(getValorQuantoVouReceber(data, cooperadoId, cooperativaId));
  if (raw.aguardandoAssinatura) {
    return {
      ...envelope,
      value: {
        exibir: true,
        mes: raw.mes,
        meses: raw.meses,
        mesLabel: raw.mesLabel,
        valor: raw.valor,
        valorRecibo: raw.valorRecibo,
        aguardandoAssinatura: true,
      },
    };
  }
  if (raw.valor > 0) {
    return {
      ...envelope,
      value: {
        exibir: true,
        mes: raw.mes,
        meses: raw.meses,
        mesLabel: raw.mesLabel,
        valor: raw.valor,
        valorRecibo: 0,
        aguardandoAssinatura: false,
      },
    };
  }
  return envelope;
}

export function bicCentralQuantoVouReceberParaExibicao(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts?: Pick<BicCentralProjecaoOpts, "apresentacaoConsolidada">
): BicExibicaoEnvelope<ReturnType<typeof getValorQuantoVouReceber>> {
  const consolidated = effectiveApresentacaoConsolidada(data, cooperadoId, cooperativaId, opts);
  const envelope = getQuantoVouReceberCooperadoParaExibicao(data, cooperadoId, cooperativaId, {
    apresentacaoConsolidada: consolidated,
  });
  if (!isBicCentralReadAuthorityEnabled()) return envelope;
  const raw = bicCentralSincronizarRotuloMeses(getValorQuantoVouReceber(data, cooperadoId, cooperativaId));
  const normalized = bicCentralNormalizarValorM6(raw);
  const value =
    normalized.valor > 0
      ? cooperadoQuantoVouReceberParaApresentacao(normalized, consolidated)
      : cooperadoQuantoVouReceberParaApresentacao(envelope.value, consolidated);
  return { ...envelope, value: bicCentralNormalizarValorM6(value) };
}

function bicCentralNormalizarValorM6(
  raw: ReturnType<typeof getValorQuantoVouReceber>
): ReturnType<typeof getValorQuantoVouReceber> {
  if (!isBicCentralReadAuthorityEnabled()) return raw;
  const valor = raw.valor > 0 ? raw.valor : raw.valorRecibo > 0 ? raw.valorRecibo : 0;
  return {
    ...raw,
    valor,
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

  const valorDestaque = m6.valor > 0 ? m6.valor : m6.valorRecibo > 0 ? m6.valorRecibo : 0;
  if (valorDestaque > 0) {
    return {
      estado: "a_receber",
      mesLabel: m6.mesLabel,
      valorDestaque,
      valorRecibo: 0,
      aguardandoAssinatura: false,
      valorAberto: m6.valor > 0 ? m6.valor : valorDestaque,
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
  const m6 = bicCentralSincronizarRotuloMeses(
    bicCentralValorAReceberAgregado(data, cooperadoId, cooperativaId, optsEff)
  );

  if (isBicCentralReadAuthorityEnabled()) {
    if (m6.aguardandoAssinatura && m6.valor > 0) {
      return cooperadoInicioParaCardsDefinitivos(
        {
          exibir: true,
          mes: m6.mes,
          meses: m6.meses,
          mesLabel: m6.mesLabel,
          valor: m6.valor,
          valorRecibo: 0,
          aguardandoAssinatura: false,
        },
        consolidated
      );
    }
    if (m6.aguardandoAssinatura) {
      return cooperadoInicioParaCardsDefinitivos(
        {
          exibir: true,
          mes: m6.mes,
          meses: m6.meses,
          mesLabel: m6.mesLabel,
          valor: m6.valorRecibo > 0 ? m6.valorRecibo : m6.valor,
          valorRecibo: 0,
          aguardandoAssinatura: false,
        },
        consolidated
      );
    }
    if (m6.valor > 0) {
      return cooperadoInicioParaCardsDefinitivos(
        {
          exibir: true,
          mes: m6.mes,
          meses: m6.meses,
          mesLabel: m6.mesLabel,
          valor: m6.valor,
          valorRecibo: 0,
          aguardandoAssinatura: false,
        },
        consolidated
      );
    }
  }

  const inicio = isBicCentralReadAuthorityEnabled()
    ? bicCentralInicioParaExibicao(data, cooperadoId, cooperativaId, optsEff).value
    : getInicioCooperadoParaExibicao(data, cooperadoId, cooperativaId, optsEff).value;

  return cooperadoInicioParaCardsDefinitivos(
    { ...inicio, mes: m6.mes, meses: m6.meses, mesLabel: m6.mesLabel },
    consolidated
  );
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

export type { EstadoQuantoVouReceberCooperado };
