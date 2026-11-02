import type { SupabaseClient } from "@supabase/supabase-js";

export async function getAppRepasseSnapshot(supabase: SupabaseClient, cnpj: string, month: string) {
  if (!/^\d{14}$/.test(cnpj) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("Cooperativa ou mês inválido para conferir o repasse.");
  }
  const { data, error } = await supabase.rpc("hb_credit_app_repasse_snapshot", {
    p_cooperative_cnpj: cnpj, p_mes_referencia: month,
  });
  if (error || !data || data.ok !== true) throw new Error("Não foi possível conferir o repasse deste mês.");
  const { pendingAmountCents: amountCents, pendingCount: allocCount, integrityErrors, existingRepasse } = data;
  if (![amountCents, allocCount, integrityErrors].every((n) => Number.isSafeInteger(n) && n >= 0) ||
      integrityErrors > allocCount || (existingRepasse !== null &&
      (typeof existingRepasse !== "object" || Array.isArray(existingRepasse)))) {
    throw new Error("O resumo do repasse precisa ser conferido.");
  }
  if (integrityErrors > 0) throw new Error("Há descontos sem liquidação consistente. Confira o fechamento antes do repasse.");
  if ((allocCount === 0) !== (amountCents === 0)) throw new Error("A composição do repasse está inconsistente.");
  if (existingRepasse && (existingRepasse.cooperative_cnpj !== cnpj || existingRepasse.mes_referencia !== month ||
      typeof existingRepasse.id !== "string" || !Number.isSafeInteger(existingRepasse.amount_cents) || existingRepasse.amount_cents <= 0 ||
      typeof existingRepasse.livro_caixa_origem_id !== "string" || !existingRepasse.livro_caixa_origem_id)) {
    throw new Error("O repasse registrado precisa ser conferido.");
  }
  return { existing: existingRepasse as Record<string, unknown> | null, amountCents: amountCents as number, allocCount: allocCount as number };
}
