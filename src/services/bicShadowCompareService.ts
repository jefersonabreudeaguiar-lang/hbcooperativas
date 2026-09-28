/**
 * BIC B2.2 / B2.5 — shadow compare (read-only, tenant-strict em B2.5).
 *
 * LEGADO = autoridade atual (cooperadoEntregasService).
 * BIC = observador — projeção autorizada no shadow somente com tenant válido (B2.5).
 *
 * Integração UI: nenhuma. Diagnóstico:
 *   compareQuantoVouReceberShadow(data, context)
 */
import type { AppData } from "@/types";
import type { BICContext, BicShadowTenantStatus, BicTenantValidationStatus } from "@/types/bic";
import { bicShadowTenantStatusFromValidation } from "@/types/bic";
import { getValorQuantoVouReceber } from "@/services/cooperadoEntregasService";
import { getProjecaoFinanceiraCooperadoBIC } from "@/services/bicProjecaoFinanceiraCooperado";
import {
  assertBicTenantContext,
  BicTenantContextError,
  validateBicTenantContext,
} from "@/services/bicTenantGuard";

export { assertBicTenantContext, BicTenantContextError };

export type BicQuantoVouReceberSnapshot = {
  mes: string;
  meses: string[];
  mesLabel: string;
  valor: number;
  valorRecibo: number;
  aguardandoAssinatura: boolean;
};

export type BicShadowCompareResult = {
  motor: "quanto_vou_receber_m6";
  context: {
    cooperativaId: string;
    cooperadoId: string;
    cooperativaCnpj?: string;
  };
  comparedAt: string;
  /** Autoridade de exibição atual — legado. */
  authority: "legacy";
  /** Caminho BIC — somente observação. */
  observer: "bic_shadow";
  /** B2.5 — agregado valid | invalid | indeterminate. */
  tenantStatus: BicShadowTenantStatus;
  /** Status detalhado da guarda B2.4. */
  tenantValidationStatus: BicTenantValidationStatus;
  /** Tenant permitido para contrato BIC (projeção autorizada). */
  permitted: boolean;
  /** false quando tenant inválido/indeterminado — valorBIC não é projeção autorizada. */
  bicProjectionAuthorized: boolean;
  /** Motivo de bloqueio da projeção BIC (não confundir com autoridade legado). */
  blockedReason?: string;
  /** @deprecated B2.5 — use blockedReason */
  tenantWarning?: string;
  /** Legado M6 — autoridade; em tenant inválido = diagnóstico cross-tenant. */
  valorLegado?: BicQuantoVouReceberSnapshot;
  /** Projeção BIC autorizada — presente somente se bicProjectionAuthorized. */
  valorBIC?: BicQuantoVouReceberSnapshot;
  /** Motor BIC bruto — somente diagnóstico quando bicProjectionAuthorized=false. */
  valorBICDiagnostic?: BicQuantoVouReceberSnapshot;
  /** Equivalência M6 autorizada — false se tenant bloqueado ou diffs reais. */
  equivalente: boolean;
  diferencas: string[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function diffQuantoVouReceberSnapshots(
  legado: BicQuantoVouReceberSnapshot,
  bic: BicQuantoVouReceberSnapshot
): string[] {
  const diffs: string[] = [];
  if (legado.mes !== bic.mes) diffs.push(`mes: ${legado.mes} !== ${bic.mes}`);
  if (round2(legado.valor) !== round2(bic.valor)) {
    diffs.push(`valor: ${legado.valor} !== ${bic.valor}`);
  }
  if (round2(legado.valorRecibo) !== round2(bic.valorRecibo)) {
    diffs.push(`valorRecibo: ${legado.valorRecibo} !== ${bic.valorRecibo}`);
  }
  if (legado.aguardandoAssinatura !== bic.aguardandoAssinatura) {
    diffs.push(
      `aguardandoAssinatura: ${legado.aguardandoAssinatura} !== ${bic.aguardandoAssinatura}`
    );
  }
  const mesesLegado = [...legado.meses].sort().join(",");
  const mesesBic = [...bic.meses].sort().join(",");
  if (mesesLegado !== mesesBic) {
    diffs.push(`meses: [${mesesLegado}] !== [${mesesBic}]`);
  }
  if (legado.mesLabel !== bic.mesLabel) {
    diffs.push(`mesLabel: ${legado.mesLabel} !== ${bic.mesLabel}`);
  }
  return diffs;
}

function buildShadowBase(
  context: BICContext,
  tenantValidation: ReturnType<typeof validateBicTenantContext>,
  tenantStatus: BicShadowTenantStatus,
  bicProjectionAuthorized: boolean
): Pick<
  BicShadowCompareResult,
  | "motor"
  | "context"
  | "comparedAt"
  | "authority"
  | "observer"
  | "tenantStatus"
  | "tenantValidationStatus"
  | "permitted"
  | "bicProjectionAuthorized"
  | "blockedReason"
  | "tenantWarning"
> {
  const blockedReason = bicProjectionAuthorized ? undefined : tenantValidation.message;
  return {
    motor: "quanto_vou_receber_m6",
    context: {
      cooperativaId: context.cooperativaId?.trim() ?? "",
      cooperadoId: context.cooperadoId?.trim() ?? "",
      cooperativaCnpj: context.cooperativaCnpj,
    },
    comparedAt: new Date().toISOString(),
    authority: "legacy",
    observer: "bic_shadow",
    tenantStatus,
    tenantValidationStatus: tenantValidation.status,
    permitted: bicProjectionAuthorized,
    bicProjectionAuthorized,
    blockedReason,
    tenantWarning: blockedReason,
  };
}

/**
 * Compara projeção legado (M6) vs BIC (fachada B1.2). Somente memória.
 * B2.5: projeção BIC cross-tenant não é autorizada; legado permanece diagnóstico/autoridade.
 */
export function compareQuantoVouReceberShadow(
  data: AppData,
  context: BICContext
): BicShadowCompareResult {
  const tenantValidation = validateBicTenantContext(data, context);
  const tenantStatus = bicShadowTenantStatusFromValidation(tenantValidation.status);
  const bicProjectionAuthorized = tenantValidation.status === "valid";
  const base = buildShadowBase(context, tenantValidation, tenantStatus, bicProjectionAuthorized);

  if (tenantStatus === "indeterminate") {
    return {
      ...base,
      valorLegado: undefined,
      valorBIC: undefined,
      valorBICDiagnostic: undefined,
      equivalente: false,
      diferencas: base.blockedReason ? [`tenant: ${base.blockedReason}`] : [],
    };
  }

  const cooperativaId = base.context.cooperativaId;
  const cooperadoId = base.context.cooperadoId;

  const valorLegado = getValorQuantoVouReceber(data, cooperadoId, cooperativaId);

  if (bicProjectionAuthorized) {
    const proj = getProjecaoFinanceiraCooperadoBIC(data, cooperadoId, cooperativaId);
    const valorBIC = proj.quantoVouReceber!;
    const diferencas = diffQuantoVouReceberSnapshots(valorLegado, valorBIC);
    return {
      ...base,
      valorLegado,
      valorBIC,
      valorBICDiagnostic: undefined,
      equivalente: diferencas.length === 0,
      diferencas,
    };
  }

  const valorBICDiagnostic = getValorQuantoVouReceber(data, cooperadoId, cooperativaId);
  return {
    ...base,
    valorLegado,
    valorBIC: undefined,
    valorBICDiagnostic,
    equivalente: false,
    diferencas: base.blockedReason ? [`tenant: ${base.blockedReason}`] : [],
  };
}
