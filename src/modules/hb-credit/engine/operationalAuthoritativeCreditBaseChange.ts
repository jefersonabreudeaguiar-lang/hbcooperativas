/**
 * Fase 2.4 — detecta alteração material do crédito-base authoritative (operacional + notas).
 * Usado antes de persistir operacional na nuvem para marcar HB STALE.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Cooperado, NotaPedido } from "@/types";
import type { OperacionalSyncPayload } from "@/lib/supabase/cooperativaSyncStorage";
import { fetchCooperadosFromStorage } from "@/lib/supabase/cooperadosStorage";
import { fetchNotasFromTable, fetchNotasFromStorage, mergeNotasSources } from "@/lib/supabase/notasStorage";
import { fetchOperacionalSync } from "@/lib/supabase/cooperativaSyncStorage";
import { buildMinimalAppDataForCreditBase } from "@/modules/hb-credit/engine/creditBaseAuthoritative";
import { buildCreditosBaseMap } from "@/modules/hb-credit/engine/creditBaseFromFicha";
import { reconciliarFichaFromNotasConferidas } from "@/services/notaPedidoService";
import {
  posProcessarIntegridadePagamentosCooperativa,
  sanitizarOperacionalSyncPayload,
} from "@/services/pagamentoIntegridadeService";
import { markHbCreditLimitStale } from "@/modules/hb-credit/engine/hbCreditLimitSyncState";
import { logServerMutationAudit } from "@/lib/security/serverAudit";
import type { SessionClaims } from "@/lib/security/jwt";
import { normalizeCnpj } from "@/utils/cooperativa";
import { OPERATIONAL_RESET_VERSION } from "@/services/operationalReset";

const BASE_TOLERANCE_CENTS = 0;

export type AuthoritativeCreditBaseDiff = {
  material: boolean;
  changedCooperadoIds: string[];
  beforeCents: Record<string, number>;
  afterCents: Record<string, number>;
};

function normalizeOperacionalForAuthoritativeCompare(
  operacional: OperacionalSyncPayload
): OperacionalSyncPayload {
  return sanitizarOperacionalSyncPayload(operacional, reconciliarFichaFromNotasConferidas);
}

/** Mesma base efetiva do HB após integridade de pagamentos (alinharFichaComPagamentosCooperativa). */
function creditosBaseFromOperacionalForHb(opts: {
  operacional: OperacionalSyncPayload;
  cooperativaId: string;
  cnpj: string;
  cooperados: Cooperado[];
  notas: NotaPedido[];
  cooperadoIds: string[];
}): Record<string, number> {
  const normalized = normalizeOperacionalForAuthoritativeCompare(opts.operacional);
  const data = buildMinimalAppDataForCreditBase({
    operacional: normalized,
    cooperativaId: opts.cooperativaId,
    cnpj: opts.cnpj,
    cooperados: opts.cooperados,
    notasPedido: opts.notas,
  });
  const aligned = posProcessarIntegridadePagamentosCooperativa(data);
  return buildCreditosBaseMap(aligned, opts.cooperadoIds, opts.cooperativaId);
}

export function diffAuthoritativeCreditBaseFromOperacional(opts: {
  beforeOperacional: OperacionalSyncPayload;
  afterOperacional: OperacionalSyncPayload;
  cooperativaId: string;
  cnpj: string;
  cooperados: Cooperado[];
  notas: NotaPedido[];
  cooperadoIds: string[];
}): AuthoritativeCreditBaseDiff {
  const digits = normalizeCnpj(opts.cnpj);
  const ids = [...new Set(opts.cooperadoIds.filter(Boolean))];
  const beforeNorm = normalizeOperacionalForAuthoritativeCompare(opts.beforeOperacional);
  const afterNorm = normalizeOperacionalForAuthoritativeCompare(opts.afterOperacional);

  const beforeCents = creditosBaseFromOperacionalForHb({
    operacional: beforeNorm,
    cooperativaId: opts.cooperativaId,
    cnpj: digits,
    cooperados: opts.cooperados,
    notas: opts.notas,
    cooperadoIds: ids,
  });
  const afterCents = creditosBaseFromOperacionalForHb({
    operacional: afterNorm,
    cooperativaId: opts.cooperativaId,
    cnpj: digits,
    cooperados: opts.cooperados,
    notas: opts.notas,
    cooperadoIds: ids,
  });

  const changedCooperadoIds: string[] = [];
  for (const id of ids) {
    const b = Math.max(0, Math.round(Number(beforeCents[id] ?? 0)));
    const a = Math.max(0, Math.round(Number(afterCents[id] ?? 0)));
    if (Math.abs(a - b) > BASE_TOLERANCE_CENTS) {
      changedCooperadoIds.push(id);
    }
  }

  return {
    material: changedCooperadoIds.length > 0,
    changedCooperadoIds,
    beforeCents,
    afterCents,
  };
}

async function loadAuthoritativeContext(
  supabase: SupabaseClient,
  cnpj: string
): Promise<
  | {
      ok: true;
      cooperativaId: string;
      cooperados: Cooperado[];
      notas: NotaPedido[];
      cooperadoIds: string[];
    }
  | { ok: false; error: string }
> {
  const digits = normalizeCnpj(cnpj);
  const { data: coopRow } = await supabase.from("cooperativas").select("id").eq("cnpj", digits).maybeSingle();
  const cooperativaId = coopRow?.id ? String(coopRow.id) : "";
  if (!cooperativaId) {
    return { ok: false, error: "Cooperativa não encontrada." };
  }

  const cooperados = await fetchCooperadosFromStorage(supabase, digits);
  const cooperadoIds = cooperados.map((c) => c.id).filter(Boolean);
  const [tableResult, storageNotas] = await Promise.all([
    fetchNotasFromTable(supabase, digits),
    fetchNotasFromStorage(supabase, digits),
  ]);
  const notas = mergeNotasSources(tableResult.notas, storageNotas).map((n) => ({
    ...n,
    cooperativaId: n.cooperativaId ?? cooperativaId,
  }));

  return { ok: true, cooperativaId, cooperados, notas, cooperadoIds };
}

/**
 * Compara operacional atual na nuvem com o payload sanitizado que será gravado.
 */
export async function detectMaterialAuthoritativeCreditBaseChange(
  supabase: SupabaseClient,
  cnpj: string,
  nextOperacionalSanitized: OperacionalSyncPayload
): Promise<
  | ({ ok: true } & AuthoritativeCreditBaseDiff)
  | { ok: false; error: string }
> {
  const digits = normalizeCnpj(cnpj);
  const ctx = await loadAuthoritativeContext(supabase, digits);
  if (!ctx.ok) return ctx;

  const current = await fetchOperacionalSync(supabase, digits);
  const beforeOperacional: OperacionalSyncPayload =
    current ??
    ({
      updatedAt: new Date(0).toISOString(),
      operationalResetVersion: OPERATIONAL_RESET_VERSION,
      pagamentosCooperado: [],
      fichaCorrida: [],
      mensalidades: [],
      descontos: [],
      arquivosMensais: [],
      comunicados: [],
      config: { descontoPadraoCooperativa: 0 },
    } as OperacionalSyncPayload);

  const diff = diffAuthoritativeCreditBaseFromOperacional({
    beforeOperacional,
    afterOperacional: nextOperacionalSanitized,
    cooperativaId: ctx.cooperativaId,
    cnpj: digits,
    cooperados: ctx.cooperados,
    notas: ctx.notas,
    cooperadoIds: ctx.cooperadoIds,
  });

  return { ok: true, ...diff };
}

/**
 * Ordem Fase 2.4: detectar alteração material → MARK STALE → (caller persiste operacional).
 */
export async function markHbStaleBeforeOperacionalUpload(
  supabase: SupabaseClient,
  opts: {
    cnpj: string;
    nextOperacionalSanitized: OperacionalSyncPayload;
    actorUserId: string;
    staleReason?: string;
    auditSession?: SessionClaims | null;
  }
): Promise<
  | { ok: true; material: boolean; markedCooperadoIds: string[] }
  | { ok: false; error: string; code?: string }
> {
  const detection = await detectMaterialAuthoritativeCreditBaseChange(
    supabase,
    opts.cnpj,
    opts.nextOperacionalSanitized
  );
  if (!detection.ok) {
    return { ok: false, error: detection.error, code: "AUTHORITATIVE_BASE_DIFF_FAILED" };
  }

  if (!detection.material) {
    return { ok: true, material: false, markedCooperadoIds: [] };
  }

  const reason = opts.staleReason ?? "operacional_authoritative_credit_base_changed";
  const markedCooperadoIds: string[] = [];

  for (const cooperadoId of detection.changedCooperadoIds) {
    const mark = await markHbCreditLimitStale(supabase, {
      cnpj: opts.cnpj,
      cooperadoId,
      actorUserId: opts.actorUserId,
      reason,
    });
    if (!mark.ok) {
      return { ok: false, error: mark.error, code: "HB_LIMIT_STALE_MARK_FAILED" };
    }
    if (mark.updated) markedCooperadoIds.push(cooperadoId);
  }

  if (opts.auditSession && markedCooperadoIds.length) {
    await logServerMutationAudit(supabase, opts.auditSession, normalizeCnpj(opts.cnpj), {
      action: "editar",
      entityType: "hb_limit_sync",
      entityId: markedCooperadoIds.join(","),
      summary: `HB STALE (PIX/operacional): ${markedCooperadoIds.length} cooperado(s) após alteração do crédito-base authoritative.`,
    }).catch(() => {});
  }

  return { ok: true, material: true, markedCooperadoIds };
}
