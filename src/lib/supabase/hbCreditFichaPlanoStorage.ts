import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCnpj } from "@/utils/cooperativa";
import {
  type HbCreditFichaPlano,
  type HbCreditFichaPlanoHistoricoCiclo,
  type HbCreditMensalidadePlano,
  HB_FICHA_PLANO_EMPTY,
  brutoFichaPlanoCents,
  mensalidadesPendentesPlano,
  somaEntregasPlanoCents,
} from "@/lib/hb-credit/hbCreditFichaPlano";
import {
  resetContaCoopCooperadoCredit,
  resolveHbCreditPayCooperadoId,
  setManualValorBrutoCooperado,
  syncLimiteCooperadoFromCreditoBase,
} from "@/lib/supabase/contaCoopStorage";
import { isV2HbOnlyServer } from "@/lib/hb-credit/hbCreditV2LimiteBase";

function mapRow(row: Record<string, unknown>): HbCreditFichaPlano {
  const mensalidadesRaw = row.mensalidades;
  let mensalidades: HbCreditMensalidadePlano[] = [];
  if (Array.isArray(mensalidadesRaw)) {
    mensalidades = mensalidadesRaw.map((m) => {
      const o = m as Record<string, unknown>;
      return {
        id: String(o.id ?? ""),
        label: String(o.label ?? "Mensalidade"),
        dataCobranca: String(o.dataCobranca ?? o.data_cobranca ?? ""),
        valorCents: Math.max(0, Math.round(Number(o.valorCents ?? o.valor_cents ?? 0))),
        cobradaEm: o.cobradaEm ? String(o.cobradaEm) : o.cobrada_em ? String(o.cobrada_em) : null,
      };
    });
  }
  const historicoRaw = row.historico_ciclos;
  let historicoCiclos: HbCreditFichaPlanoHistoricoCiclo[] = [];
  if (Array.isArray(historicoRaw)) {
    historicoCiclos = historicoRaw.map((h) => {
      const o = h as Record<string, unknown>;
      return {
        archivedAt: String(o.archivedAt ?? o.archived_at ?? ""),
        entrega1Cents: Math.max(0, Math.round(Number(o.entrega1Cents ?? o.entrega_1_cents ?? 0))),
        entrega2Cents: Math.max(0, Math.round(Number(o.entrega2Cents ?? o.entrega_2_cents ?? 0))),
        entrega3Cents: Math.max(0, Math.round(Number(o.entrega3Cents ?? o.entrega_3_cents ?? 0))),
        entrega4Cents: Math.max(0, Math.round(Number(o.entrega4Cents ?? o.entrega_4_cents ?? 0))),
        entrega5Cents: Math.max(0, Math.round(Number(o.entrega5Cents ?? o.entrega_5_cents ?? 0))),
        descontoPercent: Number(o.descontoPercent ?? o.desconto_percent ?? 0),
        brutoCents: Math.max(0, Math.round(Number(o.brutoCents ?? o.bruto_cents ?? 0))),
      };
    });
  }
  return {
    cooperadoId: String(row.cooperado_id),
    entrega1Cents: Number(row.entrega_1_cents ?? 0),
    entrega2Cents: Number(row.entrega_2_cents ?? 0),
    entrega3Cents: Number(row.entrega_3_cents ?? 0),
    entrega4Cents: Number(row.entrega_4_cents ?? 0),
    entrega5Cents: Number(row.entrega_5_cents ?? 0),
    descontoPercent: Number(row.desconto_percent ?? 0),
    mensalidades,
    entregasConsumidas: Math.max(0, Math.round(Number(row.entregas_consumidas ?? 0))),
    historicoCiclos,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export function emptyFichaPlano(cooperadoId: string): HbCreditFichaPlano {
  return { cooperadoId, ...HB_FICHA_PLANO_EMPTY };
}

/** Mesmo ID da conta HB (titular) — ficha e “a receber” ficam no cooperado certo. */
export async function resolveFichaPlanoStorageCooperadoId(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string
): Promise<string> {
  return resolveHbCreditPayCooperadoId(supabase, cnpj, cooperadoId);
}

async function fetchFichaPlanoRow(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string
): Promise<{ row: Record<string, unknown> | null; storageCooperadoId: string }> {
  const digits = normalizeCnpj(cnpj);
  const id = cooperadoId.trim();
  if (!id) {
    return { row: null, storageCooperadoId: id };
  }

  const { data: direct } = await supabase
    .from("hb_credit_cooperado_ficha_plano")
    .select("*")
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", id)
    .maybeSingle();
  if (direct) {
    const storageCooperadoId = String((direct as Record<string, unknown>).cooperado_id ?? id);
    return { row: direct as Record<string, unknown>, storageCooperadoId };
  }

  const storageCooperadoId = await resolveFichaPlanoStorageCooperadoId(supabase, cnpj, id);
  if (storageCooperadoId !== id) {
    const { data: titularRow } = await supabase
      .from("hb_credit_cooperado_ficha_plano")
      .select("*")
      .eq("cooperative_cnpj", digits)
      .eq("cooperado_id", storageCooperadoId)
      .maybeSingle();
    if (titularRow) {
      return { row: titularRow as Record<string, unknown>, storageCooperadoId };
    }
  }
  return { row: null, storageCooperadoId };
}

export async function getFichaPlanoCooperado(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string
): Promise<HbCreditFichaPlano> {
  const { row, storageCooperadoId } = await fetchFichaPlanoRow(supabase, cnpj, cooperadoId);
  if (!row) return emptyFichaPlano(storageCooperadoId);
  const plano = mapRow(row);
  return { ...plano, cooperadoId: storageCooperadoId };
}

export async function saveFichaPlanoCooperado(
  supabase: SupabaseClient,
  cnpj: string,
  plano: HbCreditFichaPlano,
  actorUserId: string
): Promise<
  | { ok: true; plano: HbCreditFichaPlano; storageCooperadoId: string; limiteWarning?: string }
  | { ok: false; error: string }
> {
  const digits = normalizeCnpj(cnpj);
  const storageCooperadoId = await resolveFichaPlanoStorageCooperadoId(
    supabase,
    digits,
    plano.cooperadoId
  );
  const now = new Date().toISOString();
  const patch = {
    cooperative_cnpj: digits,
    cooperado_id: storageCooperadoId,
    entrega_1_cents: Math.max(0, Math.round(plano.entrega1Cents)),
    entrega_2_cents: Math.max(0, Math.round(plano.entrega2Cents)),
    entrega_3_cents: Math.max(0, Math.round(plano.entrega3Cents)),
    entrega_4_cents: Math.max(0, Math.round(plano.entrega4Cents)),
    entrega_5_cents: Math.max(0, Math.round(plano.entrega5Cents)),
    desconto_percent: Math.min(100, Math.max(0, Number(plano.descontoPercent) || 0)),
    mensalidades: plano.mensalidades ?? [],
    entregas_consumidas: Math.max(0, Math.round(plano.entregasConsumidas ?? 0)),
    historico_ciclos: plano.historicoCiclos ?? [],
    updated_at: now,
    updated_by: actorUserId,
  };

  const { error } = await supabase.from("hb_credit_cooperado_ficha_plano").upsert(patch, {
    onConflict: "cooperative_cnpj,cooperado_id",
  });
  if (error) {
    if (/historico_ciclos/i.test(error.message ?? "")) {
      const { historico_ciclos: _h, ...patchSemHistorico } = patch;
      const retry = await supabase.from("hb_credit_cooperado_ficha_plano").upsert(patchSemHistorico, {
        onConflict: "cooperative_cnpj,cooperado_id",
      });
      if (retry.error) {
        return { ok: false, error: retry.error.message ?? "Erro ao salvar ficha." };
      }
    } else if (/hb_credit_cooperado_ficha_plano/i.test(error.message ?? "")) {
      return {
        ok: false,
        error: "Tabela hb_credit_cooperado_ficha_plano ausente na nuvem — aplique a migration V2.",
      };
    } else {
      return { ok: false, error: error.message ?? "Erro ao salvar ficha." };
    }
  }

  if (storageCooperadoId !== plano.cooperadoId) {
    await supabase
      .from("hb_credit_cooperado_ficha_plano")
      .delete()
      .eq("cooperative_cnpj", digits)
      .eq("cooperado_id", plano.cooperadoId);
  }

  const bruto = brutoFichaPlanoCents(plano);
  const manual = await setManualValorBrutoCooperado(
    supabase,
    digits,
    storageCooperadoId,
    bruto > 0 ? bruto : null,
    actorUserId
  );
  if (!manual.ok) {
    return { ok: false, error: manual.error };
  }

  /** V2: só grava ficha + bruto na conta (aba Limites). Liberação = percentual na aba Limites. */
  let limiteWarning: string | undefined;
  if (!isV2HbOnlyServer() && bruto > 0) {
    const sync = await syncLimiteCooperadoFromCreditoBase(
      supabase,
      digits,
      storageCooperadoId,
      bruto,
      actorUserId,
      { [storageCooperadoId]: bruto }
    );
    if (!sync.ok) {
      limiteWarning =
        sync.error ||
        "Ficha salva, mas o limite HB não foi liberado — configure o percentual em HB Créditos → Limites.";
    }
  }

  return {
    ok: true,
    plano: { ...plano, cooperadoId: storageCooperadoId, updatedAt: now },
    storageCooperadoId,
    limiteWarning,
  };
}

/** Arquiva entregas atuais na nuvem e zera o ciclo visível (cooperado só vê lançamentos novos). */
export async function archiveFichaPlanoEntregasCooperado(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  actorUserId: string
): Promise<
  | { ok: true; plano: HbCreditFichaPlano; storageCooperadoId: string }
  | { ok: false; error: string }
> {
  const plano = await getFichaPlanoCooperado(supabase, cnpj, cooperadoId);
  const bruto = brutoFichaPlanoCents(plano);
  const temEntregas = somaEntregasPlanoCents(plano) > 0;
  if (!temEntregas && bruto <= 0) {
    return { ok: true, plano, storageCooperadoId: plano.cooperadoId };
  }

  const now = new Date().toISOString();
  const snapshot: HbCreditFichaPlanoHistoricoCiclo = {
    archivedAt: now,
    entrega1Cents: plano.entrega1Cents,
    entrega2Cents: plano.entrega2Cents,
    entrega3Cents: plano.entrega3Cents,
    entrega4Cents: plano.entrega4Cents,
    entrega5Cents: plano.entrega5Cents,
    descontoPercent: plano.descontoPercent ?? 0,
    brutoCents: bruto,
  };

  const cleared: HbCreditFichaPlano = {
    ...plano,
    entrega1Cents: 0,
    entrega2Cents: 0,
    entrega3Cents: 0,
    entrega4Cents: 0,
    entrega5Cents: 0,
    descontoPercent: 0,
    entregasConsumidas: 0,
    historicoCiclos: [...(plano.historicoCiclos ?? []), snapshot],
  };

  const saved = await saveFichaPlanoCooperado(supabase, cnpj, cleared, actorUserId);
  if (!saved.ok) return saved;

  return { ok: true, plano: saved.plano, storageCooperadoId: saved.storageCooperadoId };
}

/**
 * V2: responsável marcou pagamento do mês — arquiva ficha, zera bruto HB e reinicia crédito na nuvem.
 */
export async function closeHbV2FichaMesAposPagamentoResponsavel(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  actorUserId: string,
  metadata?: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isV2HbOnlyServer()) return { ok: true };
  const archived = await archiveFichaPlanoEntregasCooperado(supabase, cnpj, cooperadoId, actorUserId);
  if (!archived.ok) return archived;
  const digits = normalizeCnpj(cnpj);
  const storageId = archived.storageCooperadoId;
  const manual = await setManualValorBrutoCooperado(supabase, digits, storageId, null, actorUserId);
  if (!manual.ok) return { ok: false, error: manual.error };
  const reset = await resetContaCoopCooperadoCredit(supabase, digits, storageId, actorUserId, {
    motivo: "v2_pagamento_mes_responsavel",
    ...metadata,
  });
  if (!reset.ok) return { ok: false, error: reset.error };
  return { ok: true };
}

/** Após compra HB: incrementa entregas e cobra mensalidades vencidas (amount_used). */
export async function aplicarFichaPlanoAposUsoCreditoHb(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  actorUserId: string
): Promise<void> {
  const digits = normalizeCnpj(cnpj);
  const plano = await getFichaPlanoCooperado(supabase, digits, cooperadoId);
  const pendentes = mensalidadesPendentesPlano(plano);
  const extraCents = pendentes.reduce((s, m) => s + m.valorCents, 0);
  const now = new Date().toISOString();
  const hoje = now.slice(0, 10);

  const mensalidadesAtualizadas = (plano.mensalidades ?? []).map((m) => {
    if (m.valorCents > 0 && !m.cobradaEm && m.dataCobranca && m.dataCobranca <= hoje) {
      return { ...m, cobradaEm: now };
    }
    return m;
  });

  const nextPlano: HbCreditFichaPlano = {
    ...plano,
    entregasConsumidas: Math.min(5, (plano.entregasConsumidas ?? 0) + 1),
    mensalidades: mensalidadesAtualizadas,
  };

  await supabase
    .from("hb_credit_cooperado_ficha_plano")
    .update({
      entregas_consumidas: nextPlano.entregasConsumidas,
      mensalidades: mensalidadesAtualizadas,
      updated_at: now,
      updated_by: actorUserId,
    })
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", plano.cooperadoId);

  if (extraCents > 0) {
    const { data: acc } = await supabase
      .from("hb_credit_accounts")
      .select("id, amount_used_cents")
      .eq("cooperative_cnpj", digits)
      .eq("cooperado_id", plano.cooperadoId)
      .maybeSingle();
    if (acc?.id) {
      const usado = Math.max(0, Math.round(Number(acc.amount_used_cents ?? 0)));
      await supabase
        .from("hb_credit_accounts")
        .update({
          amount_used_cents: usado + extraCents,
          updated_at: now,
          updated_by: actorUserId,
        })
        .eq("id", acc.id);
    }
  }
}

/**
 * V2: alinha manual_valor_bruto_cents + limite HB ao bruto da ficha plano na nuvem.
 * Só roda quando existe linha em hb_credit_cooperado_ficha_plano.
 */
export async function reconcileHbBrutoFromFichaPlano(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  actorUserId: string
): Promise<{ brutoFichaPlanoCents: number | null }> {
  if (!isV2HbOnlyServer()) return { brutoFichaPlanoCents: null };
  const digits = normalizeCnpj(cnpj);
  const { row: fichaRow, storageCooperadoId } = await fetchFichaPlanoRow(
    supabase,
    digits,
    cooperadoId
  );
  if (!fichaRow) return { brutoFichaPlanoCents: null };

  const plano = mapRow(fichaRow);
  const bruto = brutoFichaPlanoCents(plano);
  const targetManual = bruto > 0 ? bruto : null;

  const { data: acc } = await supabase
    .from("hb_credit_accounts")
    .select("manual_valor_bruto_cents")
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", storageCooperadoId)
    .maybeSingle();

  const atualRaw = acc?.manual_valor_bruto_cents;
  const atual =
    atualRaw == null || atualRaw === ""
      ? null
      : Math.max(0, Math.round(Number(atualRaw)));

  if ((targetManual ?? 0) !== (atual ?? 0)) {
    const manual = await setManualValorBrutoCooperado(
      supabase,
      digits,
      storageCooperadoId,
      targetManual,
      actorUserId
    );
  }

  return { brutoFichaPlanoCents: bruto };
}
