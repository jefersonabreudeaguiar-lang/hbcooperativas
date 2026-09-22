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

  /** Mesma base do app após sync (reconciliar); posProcessar aqui zera indevidamente o a receber no servidor. */
  return reconciliarFichaFromNotasConferidas(data);
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
  return buildCreditosBaseMap(data, cooperadoIds, cooperativaId);
}

/** Crédito-base autoritativo a partir do operacional.json + notas na nuvem. */
export async function resolveAuthoritativeCreditosBaseCents(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoIds: string[]
): Promise<Record<string, number> | null> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14 || !cooperadoIds.length) return null;

  const operacional = await fetchOperacionalSync(supabase, digits);
  if (!operacional) return null;

  const { data: coopRow } = await supabase.from("cooperativas").select("id").eq("cnpj", digits).maybeSingle();
  const cooperativaId = coopRow?.id ? String(coopRow.id) : "";
  if (!cooperativaId) return null;

  const cooperados = await fetchCooperadosFromStorage(supabase, digits);
  const [tableResult, storageNotas] = await Promise.all([
    fetchNotasFromTable(supabase, digits),
    fetchNotasFromStorage(supabase, digits),
  ]);
  const notas = mergeNotasSources(tableResult.notas, storageNotas).map((n) => ({
    ...n,
    cooperativaId: n.cooperativaId ?? cooperativaId,
  }));

  return buildCreditosBaseAuthoritativeFromCloud(
    operacional,
    cooperativaId,
    digits,
    cooperadoIds,
    cooperados,
    notas
  );
}
