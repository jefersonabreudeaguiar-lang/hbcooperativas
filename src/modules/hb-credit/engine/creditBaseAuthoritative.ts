import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppData, Cooperado, NotaPedido } from "@/types";
import type { OperacionalSyncPayload } from "@/lib/supabase/cooperativaSyncStorage";
import { fetchCooperadosFromStorage } from "@/lib/supabase/cooperadosStorage";
import { fetchNotasFromTable, fetchNotasFromStorage, mergeNotasSources } from "@/lib/supabase/notasStorage";
import { fetchOperacionalSync } from "@/lib/supabase/cooperativaSyncStorage";
import { mergeCloudCooperadosIntoData, listCooperadoIdsMesmoTitular } from "@/services/cooperadoCloudService";
import { mergeOperacionalIntoData } from "@/services/cooperativaSyncCloudService";
import { reconciliarFichaFromNotasConferidas } from "@/services/notaPedidoService";
import { normalizeCnpj } from "@/utils/cooperativa";
import { buildCreditosBaseMap } from "./creditBaseFromFicha";
import { blindarMapaCreditoBaseCentsHb, prepararAppDataParaCreditoBaseHb } from "./creditBaseHbGuard";

/** Snapshot operacional + notas — mesma base que responsável/cooperado (valor a receber pendente). */
export function buildMinimalAppDataForCreditBase(opts: {
  operacional: OperacionalSyncPayload;
  cooperativaId: string;
  cnpj: string;
  cooperados: Cooperado[];
  notasPedido: NotaPedido[];
}): AppData {
  const digits = normalizeCnpj(opts.cnpj);
  let data = {
    cooperativas: [
      {
        id: opts.cooperativaId,
        nome: "",
        cnpj: digits,
        createdAt: "",
        updatedAt: "",
      },
    ],
    cooperados: [],
    users: [],
    notasPedido: opts.notasPedido.map((n) => ({
      ...n,
      cooperativaId: n.cooperativaId ?? opts.cooperativaId,
    })),
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    ajustesFichaMes: [],
    mensalidades: [],
    descontos: [],
    valoresAvulsosReceber: [],
    comunicados: [],
    instituicoes: [],
    produtosInstituicao: [],
    config: opts.operacional.config ?? { descontoPadraoCooperativa: 0 },
  } as unknown as AppData;

  data = mergeCloudCooperadosIntoData(data, opts.cooperados, digits, opts.cooperativaId);
  data = mergeOperacionalIntoData(data, opts.operacional, opts.cooperativaId, opts.cooperados, undefined, {
    forAuthoritativeCreditBase: true,
  });

  return prepararAppDataParaCreditoBaseHb(data, digits);
}

export function buildCreditosBaseAuthoritativeFromCloud(
  operacional: OperacionalSyncPayload,
  cooperativaId: string,
  cnpj: string,
  cooperadoIds: string[],
  cooperados: Cooperado[],
  notasPedido: NotaPedido[]
): Record<string, number> {
  const data = buildMinimalAppDataForCreditBase({
    operacional,
    cooperativaId,
    cnpj,
    cooperados,
    notasPedido,
  });
  const map = buildCreditosBaseMap(data, cooperadoIds, cooperativaId);
  const blinded = blindarMapaCreditoBaseCentsHb(data, cooperativaId, map);
  return expandCreditosBaseMapCooperadoIds(data, cooperativaId, blinded);
}

/** Replica crédito-base para ids do mesmo titular — contas HB e UI podem usar ids diferentes. */
export function expandCreditosBaseMapCooperadoIds(
  data: AppData,
  cooperativaId: string,
  creditosBaseCents: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = { ...creditosBaseCents };
  for (const c of data.cooperados ?? []) {
    if (c.cooperativaId !== cooperativaId) continue;
    const ids = listCooperadoIdsMesmoTitular(data, c.id, cooperativaId);
    const max = ids.reduce((m, id) => Math.max(m, out[id] ?? 0), 0);
    if (max <= 0) continue;
    for (const id of ids) out[id] = max;
  }
  return out;
}

export type AuthoritativeCreditBaseFailureCode =
  | "INVALID_CNPJ"
  | "EMPTY_COOPERADOS"
  | "OPERACIONAL_UNAVAILABLE"
  | "COOPERATIVA_NOT_FOUND";

/** Erro exposto ao cliente quando a base autoritativa (M6) não pôde ser calculada. */
export type AuthoritativeCreditBaseErrorPayload = {
  code: AuthoritativeCreditBaseFailureCode;
  message: string;
};

export type AuthoritativeCreditBaseResult =
  | {
      ok: true;
      cooperativeCnpj: string;
      cooperativaId: string;
      creditosBaseCents: Record<string, number>;
      creditoBaseAppData: AppData;
    }
  | { ok: false; code: AuthoritativeCreditBaseFailureCode; message: string };

/** Crédito-base autoritativo — operacional.json + notas na nuvem + mesmas regras da ficha. */
export async function resolveAuthoritativeCreditBase(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoIds: string[]
): Promise<AuthoritativeCreditBaseResult> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) {
    return { ok: false, code: "INVALID_CNPJ", message: "CNPJ inválido." };
  }
  if (!cooperadoIds.length) {
    return { ok: false, code: "EMPTY_COOPERADOS", message: "Informe ao menos um cooperado." };
  }

  const operacional = await fetchOperacionalSync(supabase, digits);
  if (!operacional) {
    return {
      ok: false,
      code: "OPERACIONAL_UNAVAILABLE",
      message: "Snapshot operacional indisponível na nuvem.",
    };
  }

  const { data: coopRow } = await supabase.from("cooperativas").select("id").eq("cnpj", digits).maybeSingle();
  const cooperativaId = coopRow?.id ? String(coopRow.id) : "";
  if (!cooperativaId) {
    return { ok: false, code: "COOPERATIVA_NOT_FOUND", message: "Cooperativa não encontrada." };
  }

  const cooperados = await fetchCooperadosFromStorage(supabase, digits);
  const [tableResult, storageNotas] = await Promise.all([
    fetchNotasFromTable(supabase, digits),
    fetchNotasFromStorage(supabase, digits),
  ]);
  const notas = mergeNotasSources(tableResult.notas, storageNotas).map((n) => ({
    ...n,
    cooperativaId: n.cooperativaId ?? cooperativaId,
  }));

  const creditosBaseCents = buildCreditosBaseAuthoritativeFromCloud(
    operacional,
    cooperativaId,
    digits,
    cooperadoIds,
    cooperados,
    notas
  );

  const creditoBaseAppData = buildMinimalAppDataForCreditBase({
    operacional,
    cooperativaId,
    cnpj: digits,
    cooperados,
    notasPedido: notas,
  });

  return {
    ok: true,
    cooperativeCnpj: digits,
    cooperativaId,
    creditosBaseCents,
    creditoBaseAppData,
  };
}

/** Compat — retorna null se snapshot autoritativo indisponível. */
export async function resolveAuthoritativeCreditosBaseCents(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoIds: string[]
): Promise<Record<string, number> | null> {
  const result = await resolveAuthoritativeCreditBase(supabase, cnpj, cooperadoIds);
  return result.ok ? result.creditosBaseCents : null;
}
