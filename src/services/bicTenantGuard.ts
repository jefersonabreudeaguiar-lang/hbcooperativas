/**
 * BIC B2.4 — guarda de tenant (contrato puro, read-only).
 * Determinística, sem I/O, sem Supabase/localStorage/fetch.
 * Não altera legado nem dados financeiros.
 */
import type { AppData } from "@/types";
import type { BICContext, BicTenantValidation } from "@/types/bic";
import { normalizeCnpj } from "@/utils/cooperativa";

export class BicTenantContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BicTenantContextError";
  }
}

/** Exige ids não vazios e formato de CNPJ quando informado (pré-condição BIC). */
export function assertBicTenantContext(context: BICContext): void {
  const coopId = context.cooperativaId?.trim() ?? "";
  const cooperadoId = context.cooperadoId?.trim() ?? "";
  if (!coopId) {
    throw new BicTenantContextError("BIC exige cooperativaId no contexto de tenant.");
  }
  if (!cooperadoId) {
    throw new BicTenantContextError("BIC exige cooperadoId no contexto de tenant.");
  }
  if (context.cooperativaCnpj != null && context.cooperativaCnpj !== "") {
    const digits = normalizeCnpj(context.cooperativaCnpj);
    if (digits.length !== 14) {
      throw new BicTenantContextError("BIC cooperativaCnpj inválido (esperado 14 dígitos).");
    }
  }
}

/**
 * Valida coerência tenant × cooperado em memória (AppData).
 * Nunca infere tenant ausente nem faz fallback para outra cooperativa.
 */
export function validateBicTenantContext(
  data: AppData,
  context: BICContext
): BicTenantValidation {
  const cooperativaId = context.cooperativaId?.trim() ?? "";
  const cooperadoId = context.cooperadoId?.trim() ?? "";

  if (!cooperativaId) {
    return {
      status: "indeterminate_missing_cooperativaId",
      permitted: false,
      message: "BIC não assume tenant sem cooperativaId.",
    };
  }
  if (!cooperadoId) {
    return {
      status: "indeterminate_missing_cooperadoId",
      permitted: false,
      message: "BIC não assume tenant sem cooperadoId.",
    };
  }

  if (context.cooperativaCnpj != null && context.cooperativaCnpj !== "") {
    const digits = normalizeCnpj(context.cooperativaCnpj);
    if (digits.length !== 14) {
      return {
        status: "invalid_cnpj",
        permitted: false,
        message: "BIC cooperativaCnpj inválido (esperado 14 dígitos).",
      };
    }
    const coop = data.cooperativas.find((c) => c.id === cooperativaId);
    if (coop && normalizeCnpj(coop.cnpj) !== digits) {
      return {
        status: "invalid_cnpj",
        permitted: false,
        message:
          "BIC cooperativaCnpj não corresponde à cooperativaId informada (AppData).",
      };
    }
  }

  const registro = data.cooperados.find((c) => c.id === cooperadoId);
  if (!registro) {
    return {
      status: "invalid_cooperado_unknown",
      permitted: false,
      message: "cooperadoId ausente em AppData.cooperados para o contexto BIC.",
    };
  }

  if (registro.cooperativaId !== cooperativaId) {
    return {
      status: "invalid_tenant_mismatch",
      permitted: false,
      message:
        "cooperadoId não pertence à cooperativaId do contexto BIC (sem fallback cross-tenant).",
      cooperadoCooperativaId: registro.cooperativaId,
      contextCooperativaId: cooperativaId,
    };
  }

  return {
    status: "valid",
    permitted: true,
    message: "Contexto de tenant BIC válido.",
  };
}

/**
 * Guarda estrita do contrato BIC — lança se o tenant não for permitido.
 * Não integrada a fluxos produtivos em B2.4; disponível para B3+.
 */
export function assertBicTenantPermitted(
  data: AppData,
  context: BICContext
): BicTenantValidation {
  const validation = validateBicTenantContext(data, context);
  if (!validation.permitted) {
    throw new BicTenantContextError(validation.message);
  }
  return validation;
}
