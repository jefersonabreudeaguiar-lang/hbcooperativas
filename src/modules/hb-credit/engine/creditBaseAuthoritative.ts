import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppData, Cooperado, NotaPedido } from "@/types";
import type { OperacionalSyncPayload } from "@/lib/supabase/cooperativaSyncStorage";
import { fetchCooperadosFromStorage } from "@/lib/supabase/cooperadosStorage";
import { fetchNotasFromTable, fetchNotasFromStorage, mergeNotasSources } from "@/lib/supabase/notasStorage";
import { fetchOperacionalSync } from "@/lib/supabase/cooperativaSyncStorage";
import { mergeCloudCooperadosIntoData } from "@/services/cooperadoCloudService";
import { mergeOperacionalIntoData } from "@/services/cooperativaSyncCloudService";
import { reconciliarFichaFromNotasConferidas } from "@/services/notaPedidoService";
import { normalizeCnpj } from "@/utils/cooperativa";
import { buildCreditosBaseMap } from "./creditBaseFromFicha";
import { blindarMapaCreditoBaseCentsHb, purgarFichasParaCreditoBaseCloud } from "./creditBaseHbGuard";

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
  data = mergeOperacionalIntoData(data, opts.operacional, opts.cooperativaId, opts.cooperados);

  /** Mesma base do app após sync; só fichas amarradas a nota conferida/paga entram no HB. */
  return purgarFichasParaCreditoBaseCloud(data);
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
  return blindarMapaCreditoBaseCentsHb(data, cooperativaId, map);
}

export type AuthoritativeCreditBaseFailureCode =
  | "INVALID_CNPJ"
  | "EMPTY_COOPERADOS"
  | "OPERACIONAL_UNAVAILABLE"
  | "COOPERATIVA_NOT_FOUND";

export type AuthoritativeCreditBaseResult =
  | {
      ok: true;
      cooperativeCnpj: string;
      cooperativaId: string;
      creditosBaseCents: Record<string, number>;
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

  return {
    ok: true,
    cooperativeCnpj: digits,
    cooperativaId,
    creditosBaseCents,
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
