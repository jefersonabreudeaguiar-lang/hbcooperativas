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
import { markHbCreditLimitStale } from "@/modules/hb-credit/engine/hbCreditLimitSyncState";
import { logServerMutationAudit } from "@/lib/security/serverAudit";
import type { SessionClaims } from "@/lib/security/jwt";
import { normalizeCnpj } from "@/utils/cooperativa";
import { OPERATIONAL_RESET_VERSION } from "@/services/operationalReset";
import { listCooperadoIdsMesmoTitular } from "@/services/cooperadoCloudService";
import { reconciliarFichaFromNotasConferidas } from "@/services/notaPedidoService";
import { sanitizarOperacionalSyncPayload } from "@/services/pagamentoIntegridadeService";
import type { AppData } from "@/types";

const BASE_TOLERANCE_CENTS = 0;

/** Campos de ficha/pagamento que alteram crédito-base HB — comparação O(n) sem reconciliar notas. */
export function hbOperacionalCreditBaseFingerprint(op: OperacionalSyncPayload): string {
  const fichas = (op.fichaCorrida ?? [])
    .map(
      (f) =>
        `f:${f.id}:${f.cooperadoId}:${Math.round((Number(f.valorLiquido ?? (f as { valor?: number }).valor) || 0) * 100)}:${f.status ?? ""}:${f.notaPedidoId ?? ""}`
    )
    .sort();
  const pags = (op.pagamentosCooperado ?? [])
    .map(
      (p) =>
        `p:${p.id}:${p.cooperadoId}:${Math.round((Number(p.valorLiquido ?? (p as { valor?: number }).valor) || 0) * 100)}:${p.status ?? ""}`
    )
    .sort();
  return `${fichas.join("|")}||${pags.join("|")}`;
}

function fichaCreditBaseLine(f: NonNullable<OperacionalSyncPayload["fichaCorrida"]>[number]): string {
  const valorCents = Math.round((Number(f.valorLiquido ?? (f as { valor?: number }).valor) || 0) * 100);
  return `${f.id}:${f.cooperadoId}:${valorCents}:${f.status ?? ""}:${f.notaPedidoId ?? ""}`;
}

function pagCreditBaseLine(p: NonNullable<OperacionalSyncPayload["pagamentosCooperado"]>[number]): string {
  const valorCents = Math.round((Number(p.valorLiquido ?? (p as { valor?: number }).valor) || 0) * 100);
  return `${p.id}:${p.cooperadoId}:${valorCents}:${p.status ?? ""}`;
}

/** Cooperados com alteração em ficha/pagamento que entram no fingerprint HB (slow-path mais estreito). */
export function cooperadoIdsWithHbCreditBaseOperacionalDelta(
  before: OperacionalSyncPayload,
  after: OperacionalSyncPayload
): string[] {
  const ids = new Set<string>();
  const diffMaps = (
    beforeMap: Map<string, string>,
    afterMap: Map<string, string>,
    cooperadoFromKey: (key: string) => string | undefined
  ) => {
    for (const [key, line] of afterMap) {
      if (beforeMap.get(key) !== line) {
        const cid = cooperadoFromKey(line);
        if (cid) ids.add(cid);
      }
    }
    for (const key of beforeMap.keys()) {
      if (!afterMap.has(key)) {
        const cid = cooperadoFromKey(beforeMap.get(key)!);
        if (cid) ids.add(cid);
      }
    }
  };

  const beforeF = new Map((before.fichaCorrida ?? []).map((f) => [f.id, fichaCreditBaseLine(f)]));
  const afterF = new Map((after.fichaCorrida ?? []).map((f) => [f.id, fichaCreditBaseLine(f)]));
  diffMaps(beforeF, afterF, (line) => line.split(":")[1]);

  const beforeP = new Map((before.pagamentosCooperado ?? []).map((p) => [p.id, pagCreditBaseLine(p)]));
  const afterP = new Map((after.pagamentosCooperado ?? []).map((p) => [p.id, pagCreditBaseLine(p)]));
  diffMaps(beforeP, afterP, (line) => line.split(":")[1]);

  return [...ids].filter(Boolean);
}

function expandCooperadoIdsForHbTitular(
  data: AppData,
  cooperativaId: string,
  seedIds: string[]
): string[] {
  const out = new Set<string>();
  for (const id of seedIds) {
    out.add(id);
    for (const tid of listCooperadoIdsMesmoTitular(data, id, cooperativaId)) {
      out.add(tid);
    }
  }
  return [...out];
}

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
  return buildCreditosBaseMap(data, opts.cooperadoIds, opts.cooperativaId);
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
  nextOperacionalSanitized: OperacionalSyncPayload,
  options?: { existingOperacional?: OperacionalSyncPayload | null }
): Promise<
  | ({ ok: true } & AuthoritativeCreditBaseDiff)
  | { ok: false; error: string }
> {
  const digits = normalizeCnpj(cnpj);
  const current =
    options?.existingOperacional !== undefined
      ? options.existingOperacional
      : await fetchOperacionalSync(supabase, digits);

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

  if (
    hbOperacionalCreditBaseFingerprint(beforeOperacional) ===
    hbOperacionalCreditBaseFingerprint(nextOperacionalSanitized)
  ) {
    return {
      ok: true,
      material: false,
      changedCooperadoIds: [],
      beforeCents: {},
      afterCents: {},
    };
  }

  const ctx = await loadAuthoritativeContext(supabase, digits);
  if (!ctx.ok) return ctx;

  const deltaCooperadoIds = cooperadoIdsWithHbCreditBaseOperacionalDelta(
    beforeOperacional,
    nextOperacionalSanitized
  );
  const minimalForTitular = buildMinimalAppDataForCreditBase({
    operacional: nextOperacionalSanitized,
    cooperativaId: ctx.cooperativaId,
    cnpj: digits,
    cooperados: ctx.cooperados,
    notasPedido: ctx.notas,
  });
  const cooperadoIdsForDiff =
    deltaCooperadoIds.length > 0
      ? expandCooperadoIdsForHbTitular(minimalForTitular, ctx.cooperativaId, deltaCooperadoIds)
      : ctx.cooperadoIds;

  const diff = diffAuthoritativeCreditBaseFromOperacional({
    beforeOperacional,
    afterOperacional: nextOperacionalSanitized,
    cooperativaId: ctx.cooperativaId,
    cnpj: digits,
    cooperados: ctx.cooperados,
    notas: ctx.notas,
    cooperadoIds: cooperadoIdsForDiff,
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
    /** Evita re-download e permite fast-path quando ficha/pagamentos iguais. */
    existingOperacional?: OperacionalSyncPayload | null;
  }
): Promise<
  | { ok: true; material: boolean; markedCooperadoIds: string[] }
  | { ok: false; error: string; code?: string }
> {
  const detection = await detectMaterialAuthoritativeCreditBaseChange(
    supabase,
    opts.cnpj,
    opts.nextOperacionalSanitized,
    { existingOperacional: opts.existingOperacional }
  );
  if (!detection.ok) {
    return { ok: false, error: detection.error, code: "AUTHORITATIVE_BASE_DIFF_FAILED" };
  }

  if (!detection.material) {
    return { ok: true, material: false, markedCooperadoIds: [] };
  }

  const reason = opts.staleReason ?? "operacional_authoritative_credit_base_changed";
  const markedCooperadoIds: string[] = [];

  const markResults = await Promise.all(
    detection.changedCooperadoIds.map((cooperadoId) =>
      markHbCreditLimitStale(supabase, {
        cnpj: opts.cnpj,
        cooperadoId,
        actorUserId: opts.actorUserId,
        reason,
      }).then((mark) => ({ cooperadoId, mark }))
    )
  );
  for (const { cooperadoId, mark } of markResults) {
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
