import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppData, Cooperado, NotaPedido } from "@/types";
import type { OperacionalSyncPayload } from "@/lib/supabase/cooperativaSyncStorage";
import { fetchCooperadosFromStorage } from "@/lib/supabase/cooperadosStorage";
import { fetchNotasFromTable } from "@/lib/supabase/notasStorage";
import { fetchOperacionalSync } from "@/lib/supabase/cooperativaSyncStorage";
import { posProcessarIntegridadePagamentosCooperativa } from "@/services/pagamentoIntegridadeService";
import { reconciliarFichaFromNotasConferidas } from "@/services/notaPedidoService";
import { normalizeCnpj } from "@/utils/cooperativa";
import { buildCreditosBaseMap } from "./creditBaseFromFicha";

/** Snapshot operacional + notas — mesma base que responsável/cooperado (valor a receber pendente). */
export function buildMinimalAppDataForCreditBase(opts: {
  operacional: OperacionalSyncPayload;
  cooperativaId: string;
  cooperados: Cooperado[];
  notasPedido: NotaPedido[];
}): AppData {
  const base = {
    cooperativas: [
      {
        id: opts.cooperativaId,
        nome: "",
        cnpj: "",
        createdAt: "",
        updatedAt: "",
      },
    ],
    cooperados: opts.cooperados,
    users: [],
    notasPedido: opts.notasPedido,
    fichaCorrida: opts.operacional.fichaCorrida ?? [],
    pagamentosCooperado: opts.operacional.pagamentosCooperado ?? [],
    arquivosMensais: opts.operacional.arquivosMensais ?? [],
    mensalidades: opts.operacional.mensalidades ?? [],
    descontos: opts.operacional.descontos ?? [],
    valoresAvulsosReceber: opts.operacional.valoresAvulsosReceber ?? [],
    comunicados: opts.operacional.comunicados ?? [],
    instituicoes: [],
    produtosInstituicao: [],
    config: opts.operacional.config ?? { descontoPadraoCooperativa: 0 },
  } as unknown as AppData;

  return posProcessarIntegridadePagamentosCooperativa(reconciliarFichaFromNotasConferidas(base));
}

export function buildCreditosBaseAuthoritativeFromCloud(
  operacional: OperacionalSyncPayload,
  cooperativaId: string,
  cooperadoIds: string[],
  cooperados: Cooperado[],
  notasPedido: NotaPedido[]
): Record<string, number> {
  const data = buildMinimalAppDataForCreditBase({
    operacional,
    cooperativaId,
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
  const { notas } = await fetchNotasFromTable(supabase, digits);

  return buildCreditosBaseAuthoritativeFromCloud(
    operacional,
    cooperativaId,
    cooperadoIds,
    cooperados,
    notas
  );
}
