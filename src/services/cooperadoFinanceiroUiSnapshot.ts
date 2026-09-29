/**
 * PASSO 25 — fronteira read-only de autoridade financeira cooperado (UI snapshot).
 * Não persiste, não altera AppData/localStorage; não substitui telas existentes.
 */
import type { AppData } from "@/types";
import {
  bicShadowTenantStatusFromValidation,
  type BicExibicaoFallbackReason,
} from "@/types/bic";
import { isBicCentralReadAuthorityEnabled } from "@/lib/bic/bicCentralReadAuthority";
import { cooperadoMotorRevisionOperacional } from "@/lib/cooperadoInicioCardPolicy";
import { validateBicTenantContext } from "@/services/bicTenantGuard";
import {
  bicCentralResolveInicioParaExibicao,
  bicCentralResolvePainelParaExibicao,
  bicCentralValorAReceberAgregado,
} from "@/services/bicLeituraCentralCooperado";
import {
  cooperadoExibirValorReceberInicio,
  getResumoQuantoVouReceberCooperadoMotorLegado,
  getValorQuantoVouReceberMotorLegado,
  type EstadoQuantoVouReceberCooperado,
} from "@/services/cooperadoEntregasService";

export type CooperadoFinanceiroUiSnapshotStatus =
  | "CONFIRMADO"
  | "AGUARDANDO_BIC"
  | "INCONSISTENTE"
  | "LEGADO";

export type CooperadoFinanceiroUiAutoridade = "BIC" | "LEGADO";

export type CooperadoFinanceiroUiSnapshot = {
  status: CooperadoFinanceiroUiSnapshotStatus;
  autoridade: CooperadoFinanceiroUiAutoridade;
  bicAuthoritative: boolean;

  valorAReceber: number;
  mesPrincipal: string | null;
  mesLabel: string | null;
  mesesReferencia: string[];

  exibirValorNoCard: boolean;
  cardAtualizando: boolean;

  podeAssinarRecibo: boolean;
  podeExibirBannerRecibo: boolean;
  conferindoPagamentoNuvem: boolean;

  painelEstado: "carregando" | "a_receber" | "nada_pendente" | "indeterminado";
  painelValorDestaque: number;

  observability: {
    source: "bic" | "legacy";
    fallback: boolean;
    fallbackReason?: BicExibicaoFallbackReason;
    motorRevision?: string;
    tenantStatus?: "valid" | "invalid" | "unknown";
  };
};

export type BuildCooperadoFinanceiroUiSnapshotOpts = {
  apresentacaoConsolidada?: boolean;
  carregandoNuvem?: boolean;
  financeiroSincronizando?: boolean;
  /** false enquanto AppData cooperado ainda não está pronto para projeção BIC */
  dataReady?: boolean;
  conferindoPagamentoNuvem?: boolean;
};

export type BuildCooperadoFinanceiroUiSnapshotInput = {
  data: AppData | null;
  cooperadoId: string | undefined;
  cooperativaId: string | undefined;
  opts?: BuildCooperadoFinanceiroUiSnapshotOpts;
};

function mapPainelEstado(estado: EstadoQuantoVouReceberCooperado | string): CooperadoFinanceiroUiSnapshot["painelEstado"] {
  if (estado === "carregando") return "carregando";
  if (estado === "a_receber" || estado === "aguardando_assinatura") return "a_receber";
  if (estado === "nada_pendente") return "nada_pendente";
  return "indeterminado";
}

function aguardandoBicSnapshot(conferindo: boolean, painelEstado: CooperadoFinanceiroUiSnapshot["painelEstado"]): CooperadoFinanceiroUiSnapshot {
  return {
    status: "AGUARDANDO_BIC",
    autoridade: "BIC",
    bicAuthoritative: true,
    valorAReceber: 0,
    mesPrincipal: null,
    mesLabel: null,
    mesesReferencia: [],
    exibirValorNoCard: false,
    cardAtualizando: true,
    podeAssinarRecibo: false,
    podeExibirBannerRecibo: false,
    conferindoPagamentoNuvem: conferindo,
    painelEstado,
    painelValorDestaque: 0,
    observability: {
      source: "bic",
      fallback: false,
      tenantStatus: "unknown",
    },
  };
}

function inconsistenteBicSnapshot(
  fallbackReason: BicExibicaoFallbackReason,
  conferindo: boolean,
  motorRevision?: string
): CooperadoFinanceiroUiSnapshot {
  return {
    status: "INCONSISTENTE",
    autoridade: "BIC",
    bicAuthoritative: false,
    valorAReceber: 0,
    mesPrincipal: null,
    mesLabel: null,
    mesesReferencia: [],
    exibirValorNoCard: false,
    cardAtualizando: false,
    podeAssinarRecibo: false,
    podeExibirBannerRecibo: false,
    conferindoPagamentoNuvem: conferindo,
    painelEstado: "indeterminado",
    painelValorDestaque: 0,
    observability: {
      source: "bic",
      fallback: true,
      fallbackReason,
      motorRevision,
      tenantStatus: bicShadowTenantStatusFromValidation(fallbackReason),
    },
  };
}

function buildLegadoSnapshot(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts: BuildCooperadoFinanceiroUiSnapshotOpts | undefined
): CooperadoFinanceiroUiSnapshot {
  const apresentacaoConsolidada = opts?.apresentacaoConsolidada !== false;
  const carregando = Boolean(opts?.carregandoNuvem || opts?.financeiroSincronizando);
  const conferindo = Boolean(opts?.conferindoPagamentoNuvem);

  const motor = getValorQuantoVouReceberMotorLegado(data, cooperadoId, cooperativaId);
  const inicioRaw = cooperadoExibirValorReceberInicio(data, cooperadoId, cooperativaId);
  const inicio =
    apresentacaoConsolidada && !carregando
      ? inicioRaw
      : { ...inicioRaw, exibir: false, valor: 0, valorRecibo: 0, aguardandoAssinatura: false };

  const painel = getResumoQuantoVouReceberCooperadoMotorLegado(data, cooperadoId, cooperativaId, {
    carregandoNuvem: opts?.carregandoNuvem,
    financeiroSincronizando: opts?.financeiroSincronizando,
  });

  const reciboAtivo = !carregando && motor.aguardandoAssinatura && motor.valorRecibo > 0;
  const revision = cooperadoMotorRevisionOperacional(data, cooperadoId, cooperativaId);

  return {
    status: "LEGADO",
    autoridade: "LEGADO",
    bicAuthoritative: false,
    valorAReceber: carregando ? 0 : motor.valor,
    mesPrincipal: motor.mes || null,
    mesLabel: motor.mesLabel || null,
    mesesReferencia: motor.meses.length ? [...motor.meses] : motor.mes ? [motor.mes] : [],
    exibirValorNoCard: Boolean(inicio.exibir && inicio.valor > 0),
    cardAtualizando: carregando,
    podeAssinarRecibo: reciboAtivo,
    podeExibirBannerRecibo: reciboAtivo,
    conferindoPagamentoNuvem: conferindo,
    painelEstado: mapPainelEstado(painel.estado),
    painelValorDestaque: painel.valorDestaque,
    observability: {
      source: "legacy",
      fallback: false,
      motorRevision: revision,
      tenantStatus: "unknown",
    },
  };
}

/**
 * Monta snapshot read-only — última fronteira antes da UI quando BIC ON (etapas futuras).
 */
export function buildCooperadoFinanceiroUiSnapshot(
  input: BuildCooperadoFinanceiroUiSnapshotInput
): CooperadoFinanceiroUiSnapshot {
  const { data, cooperadoId, cooperativaId, opts } = input;
  const conferindo = Boolean(opts?.conferindoPagamentoNuvem);

  if (!isBicCentralReadAuthorityEnabled()) {
    if (!data || !cooperadoId) {
      return {
        status: "LEGADO",
        autoridade: "LEGADO",
        bicAuthoritative: false,
        valorAReceber: 0,
        mesPrincipal: null,
        mesLabel: null,
        mesesReferencia: [],
        exibirValorNoCard: false,
        cardAtualizando: Boolean(opts?.carregandoNuvem || opts?.financeiroSincronizando),
        podeAssinarRecibo: false,
        podeExibirBannerRecibo: false,
        conferindoPagamentoNuvem: conferindo,
        painelEstado: "indeterminado",
        painelValorDestaque: 0,
        observability: { source: "legacy", fallback: false, tenantStatus: "unknown" },
      };
    }
    return buildLegadoSnapshot(data, cooperadoId, cooperativaId, opts);
  }

  const coopId = cooperativaId?.trim() ?? "";
  const coopadoId = cooperadoId?.trim() ?? "";

  if (!data || opts?.dataReady === false) {
    const painelEstado: CooperadoFinanceiroUiSnapshot["painelEstado"] =
      opts?.carregandoNuvem || opts?.financeiroSincronizando ? "carregando" : "indeterminado";
    return aguardandoBicSnapshot(conferindo, painelEstado);
  }

  if (!coopId || !coopadoId) {
    const reason: BicExibicaoFallbackReason = !coopId
      ? "indeterminate_missing_cooperativaId"
      : "indeterminate_missing_cooperadoId";
    return inconsistenteBicSnapshot(reason, conferindo);
  }

  const validation = validateBicTenantContext(data, {
    cooperativaId: coopId,
    cooperadoId: coopadoId,
  });

  if (validation.status !== "valid") {
    const revision = cooperadoMotorRevisionOperacional(data, coopadoId, coopId);
    return inconsistenteBicSnapshot(validation.status, conferindo, revision);
  }

  const apresentacaoConsolidada = opts?.apresentacaoConsolidada !== false;
  const bicOpts = {
    apresentacaoConsolidada,
    carregandoNuvem: opts?.carregandoNuvem,
    financeiroSincronizando: opts?.financeiroSincronizando,
  };

  const m6 = bicCentralValorAReceberAgregado(data, coopadoId, coopId, { apresentacaoConsolidada });
  const inicio = bicCentralResolveInicioParaExibicao(data, coopadoId, coopId, { apresentacaoConsolidada });
  const painel = bicCentralResolvePainelParaExibicao(data, coopadoId, coopId, bicOpts);
  const revision = cooperadoMotorRevisionOperacional(data, coopadoId, coopId);
  const carregando = Boolean(opts?.carregandoNuvem || opts?.financeiroSincronizando);

  return {
    status: "CONFIRMADO",
    autoridade: "BIC",
    bicAuthoritative: true,
    valorAReceber: m6.valor,
    mesPrincipal: m6.mes || null,
    mesLabel: m6.mesLabel || null,
    mesesReferencia: m6.meses.length ? [...m6.meses] : m6.mes ? [m6.mes] : [],
    exibirValorNoCard: Boolean(inicio.exibir && inicio.valor > 0),
    cardAtualizando: carregando,
    podeAssinarRecibo: false,
    podeExibirBannerRecibo: false,
    conferindoPagamentoNuvem: conferindo,
    painelEstado: mapPainelEstado(painel.estado),
    painelValorDestaque: painel.valorDestaque,
    observability: {
      source: "bic",
      fallback: false,
      motorRevision: revision,
      tenantStatus: "valid",
    },
  };
}
