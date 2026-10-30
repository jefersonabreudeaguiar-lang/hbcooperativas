/**
 * BIC B1.2 / B2.7 / B2.9 — projeção financeira cooperado (READ-ONLY).
 */
import type { AppData } from "@/types";
import type {
  BicExibicaoEnvelope,
  BicExibicaoFallbackReason,
  BicExibicaoObservability,
  BicProjectionSource,
  BicTenantValidationStatus,
} from "@/types/bic";
import {
  cooperadoInicioParaCardsDefinitivos,
  cooperadoQuantoVouReceberParaApresentacao,
} from "@/lib/cooperadoApresentacaoFinanceira";
import { validateBicTenantContext } from "@/services/bicTenantGuard";
import {
  cooperadoExibirValorReceberInicio,
  getResumoQuantoVouReceberCooperado,
  getValorQuantoVouReceber,
  type EstadoQuantoVouReceberCooperado,
} from "@/services/cooperadoEntregasService";

export type {
  BicExibicaoEnvelope,
  BicExibicaoFallbackReason,
  BicExibicaoObservability,
  BicProjectionSource,
};
export type { EstadoQuantoVouReceberCooperado };

export type BicProjecaoFinanceiraCooperadoOpts = {
  carregandoNuvem?: boolean;
  financeiroSincronizando?: boolean;
  /** H203: false → cards início não tratam projeção local como definitiva (sem alterar motor). */
  apresentacaoConsolidada?: boolean;
};

export type BicFacadeTenantGate =
  | { kind: "available"; status: "valid"; permitted: true }
  | {
      kind: "unavailable";
      status: Exclude<BicTenantValidationStatus, "valid">;
      permitted: false;
      reason: string;
    };

export type BicProjecaoFinanceiraCooperado = {
  tenant: BicFacadeTenantGate;
  bicProjectionAuthorized: boolean;
  quantoVouReceber?: ReturnType<typeof getValorQuantoVouReceber>;
  inicio?: ReturnType<typeof cooperadoExibirValorReceberInicio>;
  painelQuantoVouReceber?: ReturnType<typeof getResumoQuantoVouReceberCooperado>;
};

function blockedProjection(
  status: Exclude<BicTenantValidationStatus, "valid">,
  reason: string
): BicProjecaoFinanceiraCooperado {
  return {
    tenant: { kind: "unavailable", status, permitted: false, reason },
    bicProjectionAuthorized: false,
  };
}

function fallbackReasonFromGate(
  proj: BicProjecaoFinanceiraCooperado
): BicExibicaoFallbackReason {
  if (proj.tenant.kind === "unavailable") return proj.tenant.status;
  throw new Error("BIC B2.9: fallbackReason exige tenant unavailable.");
}

function buildObservability(
  proj: BicProjecaoFinanceiraCooperado,
  source: BicProjectionSource
): BicExibicaoObservability {
  if (source === "bic") {
    if (!proj.bicProjectionAuthorized) {
      throw new Error("BIC B2.9: source bic exige bicProjectionAuthorized.");
    }
    return {
      source: "bic",
      fallback: false,
      bicProjectionAuthorized: true,
    };
  }
  if (proj.bicProjectionAuthorized) {
    throw new Error("BIC B2.9: source legacy exige BIC bloqueado.");
  }
  return {
    source: "legacy",
    fallback: true,
    bicProjectionAuthorized: false,
    fallbackReason: fallbackReasonFromGate(proj),
  };
}

function envelope<T>(
  value: T,
  proj: BicProjecaoFinanceiraCooperado,
  source: BicProjectionSource
): BicExibicaoEnvelope<T> {
  return { value, observability: buildObservability(proj, source) };
}

export function getProjecaoFinanceiraCooperadoBIC(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts?: BicProjecaoFinanceiraCooperadoOpts
): BicProjecaoFinanceiraCooperado {
  const validation = validateBicTenantContext(data, {
    cooperativaId: cooperativaId ?? "",
    cooperadoId,
  });

  if (validation.status !== "valid") {
    return blockedProjection(validation.status, validation.message);
  }

  const quantoVouReceber = getValorQuantoVouReceber(data, cooperadoId, cooperativaId);
  const inicio = cooperadoExibirValorReceberInicio(data, cooperadoId, cooperativaId);
  const painelQuantoVouReceber = getResumoQuantoVouReceberCooperado(
    data,
    cooperadoId,
    cooperativaId,
    opts
  );

  return {
    tenant: { kind: "available", status: "valid", permitted: true },
    bicProjectionAuthorized: true,
    quantoVouReceber,
    inicio,
    painelQuantoVouReceber,
  };
}

export function getInicioCooperadoParaExibicao(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts?: Pick<BicProjecaoFinanceiraCooperadoOpts, "apresentacaoConsolidada">
): BicExibicaoEnvelope<ReturnType<typeof cooperadoExibirValorReceberInicio>> {
  const proj = getProjecaoFinanceiraCooperadoBIC(data, cooperadoId, cooperativaId);
  const apresentacaoConsolidada = opts?.apresentacaoConsolidada !== false;
  const rawInicio =
    proj.bicProjectionAuthorized && proj.inicio
      ? proj.inicio
      : cooperadoExibirValorReceberInicio(data, cooperadoId, cooperativaId);
  const inicio = cooperadoInicioParaCardsDefinitivos(rawInicio, apresentacaoConsolidada);
  if (proj.bicProjectionAuthorized && proj.inicio) {
    return envelope(inicio, proj, "bic");
  }
  return envelope(inicio, proj, "legacy");
}

export function getQuantoVouReceberCooperadoParaExibicao(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts?: Pick<BicProjecaoFinanceiraCooperadoOpts, "apresentacaoConsolidada">
): BicExibicaoEnvelope<ReturnType<typeof getValorQuantoVouReceber>> {
  const proj = getProjecaoFinanceiraCooperadoBIC(data, cooperadoId, cooperativaId);
  const apresentacaoConsolidada = opts?.apresentacaoConsolidada !== false;
  const raw =
    proj.bicProjectionAuthorized && proj.quantoVouReceber
      ? proj.quantoVouReceber
      : getValorQuantoVouReceber(data, cooperadoId, cooperativaId);
  const value = cooperadoQuantoVouReceberParaApresentacao(raw, apresentacaoConsolidada);
  if (proj.bicProjectionAuthorized && proj.quantoVouReceber) {
    return envelope(value, proj, "bic");
  }
  return envelope(value, proj, "legacy");
}

export function getPainelQuantoVouReceberCooperadoParaExibicao(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts?: BicProjecaoFinanceiraCooperadoOpts
): BicExibicaoEnvelope<ReturnType<typeof getResumoQuantoVouReceberCooperado>> {
  const proj = getProjecaoFinanceiraCooperadoBIC(data, cooperadoId, cooperativaId, opts);
  if (proj.bicProjectionAuthorized && proj.painelQuantoVouReceber) {
    return envelope(proj.painelQuantoVouReceber, proj, "bic");
  }
  return envelope(
    getResumoQuantoVouReceberCooperado(data, cooperadoId, cooperativaId, opts),
    proj,
    "legacy"
  );
}
