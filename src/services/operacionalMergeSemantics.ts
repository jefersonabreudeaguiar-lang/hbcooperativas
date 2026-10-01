import type { OperacionalSyncPayload } from "@/lib/supabase/cooperativaSyncStorage";
import { OPERATIONAL_RESET_VERSION } from "@/services/operationalReset";

/** Domínios operacionais cujo [] autoritativo depende de operacionalSnapshotComplete (S1/S4). */
export const OPERACIONAL_DOMINIOS_COLECAO = [
  "arquivosMensais",
  "ajustesFichaMes",
  "comunicados",
  "comunicadosExcluidos",
  "mensalidades",
  "descontos",
  "valoresAvulsosReceber",
  "livroCaixa",
  "livroCaixaExcluidos",
  "prestacoesContas",
  "prestacoesContasExcluidas",
  "notasPedidoExcluidas",
  "votacaoPautas",
  "votacaoVotos",
  "pareceresContabeis",
  "fechamentoSnapshots",
] as const;

export type OperacionalDominioColecao = (typeof OPERACIONAL_DOMINIOS_COLECAO)[number];

export function operacionalBlobOperacionalLegado(raw: OperacionalSyncPayload): boolean {
  return raw.fullReset !== true && (raw.operationalResetVersion ?? 0) < OPERATIONAL_RESET_VERSION;
}

/** S4 — `key in payload` (JSON); legado pré-versão = nenhum domínio fornecido. */
export function operacionalDominioFornecidoNoPayload(
  raw: OperacionalSyncPayload,
  key: string,
  opts?: { legacyIgnorarTodosDominios?: boolean }
): boolean {
  if (opts?.legacyIgnorarTodosDominios) return false;
  return Object.prototype.hasOwnProperty.call(raw, key);
}

/** Replace de coleção só se S1 autorizou E o domínio veio explicitamente no payload. */
export function operacionalColecaoReplaceDominio(
  colecoesReplace: boolean,
  raw: OperacionalSyncPayload,
  key: OperacionalDominioColecao | "pagamentosCooperado" | "fichaCorrida",
  legacyIgnorar: boolean
): boolean {
  return (
    colecoesReplace &&
    operacionalDominioFornecidoNoPayload(raw, key, { legacyIgnorarTodosDominios: legacyIgnorar })
  );
}

export function operacionalSliceArray<T>(
  raw: OperacionalSyncPayload,
  key: string,
  normalized: OperacionalSyncPayload,
  legacyIgnorar: boolean
): T[] {
  if (!operacionalDominioFornecidoNoPayload(raw, key, { legacyIgnorarTodosDominios: legacyIgnorar })) {
    return [];
  }
  const v = (normalized as unknown as Record<string, unknown>)[key];
  return Array.isArray(v) ? (v as T[]) : [];
}
