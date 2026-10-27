import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCnpj } from "@/utils/cooperativa";
import {
  type HbCreditFichaPlano,
  type HbCreditMensalidadePlano,
  HB_FICHA_PLANO_EMPTY,
  brutoFichaPlanoCents,
  mensalidadesPendentesPlano,
} from "@/lib/hb-credit/hbCreditFichaPlano";
import { setManualValorBrutoCooperado } from "@/lib/supabase/contaCoopStorage";

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
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export function emptyFichaPlano(cooperadoId: string): HbCreditFichaPlano {
  return { cooperadoId, ...HB_FICHA_PLANO_EMPTY };
}

export async function getFichaPlanoCooperado(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string
): Promise<HbCreditFichaPlano> {
  const digits = normalizeCnpj(cnpj);
  const { data } = await supabase
    .from("hb_credit_cooperado_ficha_plano")
    .select("*")
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", cooperadoId)
    .maybeSingle();
  if (!data) return emptyFichaPlano(cooperadoId);
  return mapRow(data as Record<string, unknown>);
}

export async function saveFichaPlanoCooperado(
  supabase: SupabaseClient,
  cnpj: string,
  plano: HbCreditFichaPlano,
  actorUserId: string
): Promise<{ ok: true; plano: HbCreditFichaPlano } | { ok: false; error: string }> {
  const digits = normalizeCnpj(cnpj);
  const now = new Date().toISOString();
  const patch = {
    cooperative_cnpj: digits,
    cooperado_id: plano.cooperadoId,
    entrega_1_cents: Math.max(0, Math.round(plano.entrega1Cents)),
    entrega_2_cents: Math.max(0, Math.round(plano.entrega2Cents)),
    entrega_3_cents: Math.max(0, Math.round(plano.entrega3Cents)),
    entrega_4_cents: Math.max(0, Math.round(plano.entrega4Cents)),
    entrega_5_cents: Math.max(0, Math.round(plano.entrega5Cents)),
    desconto_percent: Math.min(100, Math.max(0, Number(plano.descontoPercent) || 0)),
    mensalidades: plano.mensalidades ?? [],
    entregas_consumidas: Math.max(0, Math.round(plano.entregasConsumidas ?? 0)),
    updated_at: now,
    updated_by: actorUserId,
  };

  const { error } = await supabase.from("hb_credit_cooperado_ficha_plano").upsert(patch, {
    onConflict: "cooperative_cnpj,cooperado_id",
  });
  if (error) {
    if (/hb_credit_cooperado_ficha_plano/i.test(error.message ?? "")) {
      return {
        ok: false,
        error: "Tabela hb_credit_cooperado_ficha_plano ausente na nuvem — aplique a migration V2.",
      };
    }
    return { ok: false, error: error.message ?? "Erro ao salvar ficha." };
  }

  const bruto = brutoFichaPlanoCents(plano);
  const manual = await setManualValorBrutoCooperado(
    supabase,
    digits,
    plano.cooperadoId,
    bruto > 0 ? bruto : null,
    actorUserId
  );
  if (!manual.ok) {
    return { ok: false, error: manual.error };
  }

  return { ok: true, plano: { ...plano, updatedAt: now } };
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
    .eq("cooperado_id", cooperadoId);

  if (extraCents > 0) {
    const { data: acc } = await supabase
      .from("hb_credit_accounts")
      .select("id, amount_used_cents")
      .eq("cooperative_cnpj", digits)
      .eq("cooperado_id", cooperadoId)
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
