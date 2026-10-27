import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContaCoopLimiteCooperado } from "@/modules/hb-credit/types";
import { normalizeCnpj } from "@/utils/cooperativa";
import { creditosBaseMapV2FichaAlinhada } from "@/lib/hb-credit/hbCreditV2LimiteBase";
import { capLimiteContaCoopV2FichaBruto } from "@/lib/hb-credit/hbCreditV2CooperadoLimiteExibicao";
import {
  buildFichaPlanoBrutoCentsMapForCooperados,
  resolveFichaPlanoStorageCooperadoId,
} from "@/lib/supabase/hbCreditFichaPlanoStorage";

function limitePlaceholder(cooperadoId: string, cnpj: string): ContaCoopLimiteCooperado {
  return {
    id: `sem-conta-${cooperadoId}`,
    cooperativaCnpj: cnpj,
    cooperadoId,
    limiteLiberadoCents: 0,
    valorUsadoCents: 0,
    valorDisponivelCents: 0,
    bloqueado: false,
    updatedAt: "",
  };
}

/** Conta HB na nuvem (titular) com cooperadoId da linha da tabela. */
async function resolveLimiteBaseCooperadoV2(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  limitesRaw: ContaCoopLimiteCooperado[]
): Promise<ContaCoopLimiteCooperado> {
  const direct = limitesRaw.find((l) => l.cooperadoId === cooperadoId);
  if (direct) return { ...direct, cooperadoId };

  const storageId = await resolveFichaPlanoStorageCooperadoId(supabase, cnpj, cooperadoId);
  const titular = limitesRaw.find((l) => l.cooperadoId === storageId);
  if (titular) return { ...titular, cooperadoId };

  const { getLimiteCooperado } = await import("@/lib/supabase/contaCoopStorage");
  const fetched = await getLimiteCooperado(supabase, cnpj, cooperadoId, {
    skipCycleHeal: true,
    skipAmountUsedReconcile: true,
    fastPreview: true,
  });
  if (fetched) return { ...fetched, cooperadoId };

  return limitePlaceholder(cooperadoId, cnpj);
}

/** Lista da aba Limites (responsável V2): bruto/liberado/disponível só da ficha HB de cada cooperado. */
export async function listLimitesV2StaffAlinhadosFichaPlano(
  supabase: SupabaseClient,
  cnpj: string,
  limitesRaw: ContaCoopLimiteCooperado[],
  cooperadoIdsLista: string[]
): Promise<{
  limites: ContaCoopLimiteCooperado[];
  creditosBaseCents: Record<string, number>;
  fichaPlanoBrutoCentsByCooperadoId: Record<string, number>;
}> {
  const digits = normalizeCnpj(cnpj);
  const ids = [...new Set(cooperadoIdsLista.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) {
    return { limites: [], creditosBaseCents: {}, fichaPlanoBrutoCentsByCooperadoId: {} };
  }

  const fichaPlanoBrutoCentsByCooperadoId = await buildFichaPlanoBrutoCentsMapForCooperados(
    supabase,
    digits,
    ids
  );
  const creditosBaseCents = creditosBaseMapV2FichaAlinhada(ids, limitesRaw, fichaPlanoBrutoCentsByCooperadoId);
  const { getCooperativaLiberacaoPercentConfigured, resolveTetoGlobal } = await import(
    "@/lib/supabase/contaCoopStorage"
  );
  const teto = await resolveTetoGlobal(supabase, digits, creditosBaseCents);
  const tetoPercent = teto.configured ? teto.percent : 0;
  const liberacaoPercent = teto.configured
    ? (await getCooperativaLiberacaoPercentConfigured(supabase, digits)) ?? tetoPercent
    : null;

  const limites: ContaCoopLimiteCooperado[] = [];
  for (const cooperadoId of ids) {
    const base = await resolveLimiteBaseCooperadoV2(supabase, digits, cooperadoId, limitesRaw);
    const bruto = Math.max(0, Math.round(fichaPlanoBrutoCentsByCooperadoId[cooperadoId] ?? 0));
    const capped = capLimiteContaCoopV2FichaBruto(base, bruto, tetoPercent, liberacaoPercent);
    limites.push({ ...capped, cooperadoId, fichaPlanoBrutoCents: bruto });
  }

  return { limites, creditosBaseCents, fichaPlanoBrutoCentsByCooperadoId };
}
