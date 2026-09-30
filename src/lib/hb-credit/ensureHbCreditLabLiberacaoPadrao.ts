/**
 * LAB: cadastra teto 70% e libera 70% do crédito-base (BIC) para cada cooperado ativo, uma vez por CNPJ.
 */
import {
  HB_CREDIT_LAB_LIBERACAO_PERCENT_DEFAULT,
  hbCreditLabLiberacaoStorageKey,
  isHbCreditLabLiberacaoAutoEnabled,
} from "@/lib/hb-credit/hbCreditLabPolicy";
import { postCreditLimites } from "@/services/creditApiService";

export type EnsureHbCreditLabLiberacaoOpts = {
  cnpj: string;
  cooperadoIds: string[];
  creditosBaseCents: Record<string, number>;
  tetoGlobalPercent: number;
  limiteDistribuidoCents: number;
};

/** @returns true se aplicou liberação LAB (chamar reload depois). */
export async function ensureHbCreditLabLiberacaoPadrao(
  opts: EnsureHbCreditLabLiberacaoOpts
): Promise<boolean> {
  if (!isHbCreditLabLiberacaoAutoEnabled()) return false;
  if (!opts.cnpj || !opts.cooperadoIds.length) return false;

  const storageKey = hbCreditLabLiberacaoStorageKey(opts.cnpj);
  if (typeof localStorage !== "undefined" && localStorage.getItem(storageKey) === "done") {
    return false;
  }

  const pct = HB_CREDIT_LAB_LIBERACAO_PERCENT_DEFAULT;
  const tetoOk = opts.tetoGlobalPercent >= pct;
  const limitesOk = opts.limiteDistribuidoCents > 0;

  if (tetoOk && limitesOk) {
    localStorage.setItem(storageKey, "done");
    return false;
  }

  try {
    if (!tetoOk) {
      await postCreditLimites({
        action: "set_teto",
        cnpj: opts.cnpj,
        tetoPercentual: pct,
        creditosBaseCents: opts.creditosBaseCents,
      });
    }

    await postCreditLimites({
      action: "set_coletivo",
      cnpj: opts.cnpj,
      cooperadoIds: opts.cooperadoIds,
      percentual: pct,
      creditosBaseCents: opts.creditosBaseCents,
    });

    localStorage.setItem(storageKey, "done");
    return true;
  } catch {
    return false;
  }
}
