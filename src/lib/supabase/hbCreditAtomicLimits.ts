import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCooperadosFromStorage } from "./cooperadosStorage";
import { resolveAuthoritativeCreditBase } from "@/modules/hb-credit/engine/creditBaseAuthoritative";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { normalizeCnpj } from "@/utils/cooperativa";
import { hbCreditEffectiveDisponivelCents } from "@/modules/hb-credit/engine/paymentAffordability";
import type { ContaCoopLimiteCooperado } from "@/modules/hb-credit/types";

export type AtomicLimitOptions = {
  cooperadoIds: string[];
  percentual?: number;
  tetoPercentual?: number;
  valorFixoCents?: number;
  preservarPercentual?: boolean;
};

export async function saveHbCreditLimitsAtomic(
  supabase: SupabaseClient,
  cnpj: string,
  actor: string,
  options: AtomicLimitOptions
): Promise<
  | { ok: true; updated: number; creditosBaseCents: Record<string, number>; limites: ContaCoopLimiteCooperado[] }
  | { ok: false; error: string; code?: string }
> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14 || !actor.trim() || !Array.isArray(options.cooperadoIds) ||
      options.cooperadoIds.some((id) => typeof id !== "string" || !id.trim())) {
    return { ok: false, error: "Cooperativa, responsável ou seleção inválida." };
  }
  for (const value of [options.percentual, options.tetoPercentual]) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 100 || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001)) {
      return { ok: false, error: "Informe um percentual entre 0 e 100, com até duas casas decimais." };
    }
  }
  if (options.valorFixoCents !== undefined && (!Number.isSafeInteger(options.valorFixoCents) || options.valorFixoCents < 0)) {
    return { ok: false, error: "Valor de limite inválido." };
  }
  // O teto inclui toda a cooperativa, não apenas a seleção ou a página visível.
  const cooperados = await fetchCooperadosFromStorage(supabase, digits);
  const ids = [...new Set(cooperados.map((c) => c.id).filter(Boolean))];
  if (!ids.length) return { ok: false, error: "Cadastro de cooperados indisponível para conferir o teto global." };
  const authority = await resolveAuthoritativeCreditBase(supabase, digits, ids);
  if (!authority.ok) return { ok: false, error: authority.message, code: authority.code };
  const canonical = (id: string) => resolverCooperadoIdCanonico(authority.creditoBaseAppData, id, authority.cooperativaId);
  const bases: Record<string, number> = Object.create(null);
  const conhecidos = new Set(ids);
  for (const id of ids) {
    const canon = canonical(id);
    conhecidos.add(canon);
    // Cópias de cadastro do mesmo titular não duplicam o lastro do teto.
    bases[canon] = Math.max(bases[canon] ?? 0, authority.creditosBaseCents[id] ?? 0, authority.creditosBaseCents[canon] ?? 0);
  }
  if (options.cooperadoIds.some((id) => !conhecidos.has(id))) {
    return { ok: false, error: "A seleção contém cooperado fora do cadastro desta cooperativa." };
  }
  const selected = [...new Set(options.cooperadoIds.map(canonical))].sort();
  const { data, error } = await supabase.rpc("hb_credit_save_limit_batch", {
    p_cnpj: digits,
    p_actor: actor,
    p_ids: selected,
    p_bases: bases,
    p_percent: options.percentual ?? null,
    p_cap_percent: options.tetoPercentual ?? null,
    p_fixed_cents: options.valorFixoCents ?? null,
    p_keep_policy: options.preservarPercentual ?? false,
  });
  if (error) return { ok: false, error: "Não foi possível confirmar a liberação. Atualize os limites para conferir o resultado antes de tentar novamente.", code: error.code };
  if (!data?.ok) return { ok: false, error: String(data?.error ?? "Liberação recusada."), code: data?.code };
  const limites = (Array.isArray(data.accounts) ? data.accounts as Record<string, unknown>[] : []).map((row) => {
    const released = Number(row.limit_released_cents);
    const used = Number(row.amount_used_cents);
    return { id: String(row.id), cooperativaCnpj: digits, cooperadoId: String(row.cooperado_id),
      limiteLiberadoCents: released, valorUsadoCents: used,
      valorDisponivelCents: hbCreditEffectiveDisponivelCents(released, Number(row.financial_limit_cap_cents), used),
      bloqueado: row.status !== "active", hasFinancialPin: row.has_financial_pin === true,
      pinLockedUntil: row.pin_locked_until ? String(row.pin_locked_until) : null,
      cashbackDisponivelCents: 0, saldoProprioDisponivelCents: Number(row.own_balance_cents ?? 0), updatedAt: String(row.updated_at),
    };
  });
  return { ok: true, updated: Number(data.updated ?? 0), creditosBaseCents: authority.creditosBaseCents, limites };
}
