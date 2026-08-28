import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { normalizeCnpj } from "@/utils/cooperativa";
import { hashPassword, verifyPassword } from "@/lib/security/password";
import type {
  ContaCoopDashboard,
  ContaCoopIntent,
  ContaCoopLedgerEntry,
  ContaCoopLimiteCooperado,
  ContaCoopParceiro,
  ContaCoopTresValores,
  ParceiroStatus,
} from "@/modules/hb-credit/types";
import { computeDisponivel } from "@/modules/hb-credit/engine/money";
import { INTENT_EXPIRY_MINUTES } from "@/modules/hb-credit/config";

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function buildQrPayload(intentId: string, nonce: string): string {
  return `${"hb-credit"}://pay/${intentId}?nonce=${encodeURIComponent(nonce)}`;
}

export function parseQrPayload(raw: string): { intentId: string; nonce: string } | null {
  const trimmed = raw.trim();
  try {
    if (trimmed.startsWith("{")) {
      const json = JSON.parse(trimmed) as { scheme?: string; intentId?: string; nonce?: string };
      if (json.scheme === "hb-credit" && json.intentId && json.nonce) {
        return { intentId: json.intentId, nonce: json.nonce };
      }
    }
    const url = trimmed.startsWith("hb-credit://")
      ? new URL(trimmed.replace("hb-credit://", "https://credit.local/"))
      : new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    const intentId = parts[parts.length - 1];
    const nonce = url.searchParams.get("nonce") ?? "";
    if (!intentId || !nonce) return null;
    return { intentId, nonce };
  } catch {
    return null;
  }
}

export async function getOrCreateTeto(
  supabase: SupabaseClient,
  cnpj: string,
  defaultCents = 0
): Promise<number> {
  const digits = normalizeCnpj(cnpj);
  const { data } = await supabase.from("conta_coop_teto").select("teto_centavos").eq("cooperativa_cnpj", digits).maybeSingle();
  if (data) return Number(data.teto_centavos);
  await supabase.from("conta_coop_teto").insert({ cooperativa_cnpj: digits, teto_centavos: defaultCents });
  return defaultCents;
}

export async function setTetoGlobal(
  supabase: SupabaseClient,
  cnpj: string,
  tetoCentavos: number,
  actorUserId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const digits = normalizeCnpj(cnpj);
  const distribuido = await sumLimitesDistribuidos(supabase, digits);
  if (tetoCentavos < distribuido) {
    return { ok: false, error: `Teto não pode ser menor que o já distribuído (${distribuido} centavos).` };
  }
  await supabase.from("conta_coop_teto").upsert({
    cooperativa_cnpj: digits,
    teto_centavos: tetoCentavos,
    updated_by: actorUserId,
    updated_at: new Date().toISOString(),
  });
  return { ok: true };
}

async function sumLimitesDistribuidos(supabase: SupabaseClient, cnpj: string): Promise<number> {
  const { data } = await supabase
    .from("conta_coop_limites")
    .select("limite_liberado_centavos")
    .eq("cooperativa_cnpj", cnpj);
  return (data ?? []).reduce((s, r) => s + Number(r.limite_liberado_centavos), 0);
}

export async function getDashboardResumo(supabase: SupabaseClient, cnpj: string): Promise<ContaCoopDashboard> {
  const digits = normalizeCnpj(cnpj);
  const tetoGlobal = await getOrCreateTeto(supabase, digits);
  const { data: limites } = await supabase
    .from("conta_coop_limites")
    .select("limite_liberado_centavos, valor_usado_centavos")
    .eq("cooperativa_cnpj", digits);

  let limiteDistribuido = 0;
  let usadoTotal = 0;
  for (const row of limites ?? []) {
    limiteDistribuido += Number(row.limite_liberado_centavos);
    usadoTotal += Number(row.valor_usado_centavos);
  }

  const { count: pendentes } = await supabase
    .from("conta_coop_parceiros")
    .select("*", { count: "exact", head: true })
    .eq("cooperativa_cnpj", digits)
    .eq("status", "pendente");

  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { count: recentes } = await supabase
    .from("conta_coop_transacoes")
    .select("*", { count: "exact", head: true })
    .eq("cooperativa_cnpj", digits)
    .gte("created_at", since);

  return {
    teto: {
      tetoGlobalCents: tetoGlobal,
      limiteDistribuidoCents: limiteDistribuido,
      restanteParaLiberarCents: Math.max(0, tetoGlobal - limiteDistribuido),
    },
    agregadoCooperados: {
      limiteLiberadoCents: limiteDistribuido,
      valorUsadoCents: usadoTotal,
      valorDisponivelCents: computeDisponivel(limiteDistribuido, usadoTotal),
    },
    parceirosPendentes: pendentes ?? 0,
    transacoesRecentes: recentes ?? 0,
  };
}

export async function listLimitesCooperados(
  supabase: SupabaseClient,
  cnpj: string
): Promise<ContaCoopLimiteCooperado[]> {
  const digits = normalizeCnpj(cnpj);
  const { data } = await supabase
    .from("conta_coop_limites")
    .select("*")
    .eq("cooperativa_cnpj", digits)
    .order("updated_at", { ascending: false });

  return (data ?? []).map(mapLimiteRow);
}

function mapLimiteRow(row: Record<string, unknown>): ContaCoopLimiteCooperado {
  const limite = Number(row.limite_liberado_centavos);
  const usado = Number(row.valor_usado_centavos);
  return {
    id: String(row.id),
    cooperativaCnpj: String(row.cooperativa_cnpj),
    cooperadoId: String(row.cooperado_id),
    limiteLiberadoCents: limite,
    valorUsadoCents: usado,
    valorDisponivelCents: computeDisponivel(limite, usado),
    bloqueado: Boolean(row.bloqueado),
    updatedAt: String(row.updated_at),
  };
}

export async function previewLimiteAlteracao(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  novoLimiteCents: number
): Promise<{
  atual: ContaCoopTresValores;
  novo: number;
  totalDistribuidoApos: number;
  tetoGlobal: number;
  ok: boolean;
  error?: string;
}> {
  const digits = normalizeCnpj(cnpj);
  const teto = await getOrCreateTeto(supabase, digits);
  const { data: atualRow } = await supabase
    .from("conta_coop_limites")
    .select("*")
    .eq("cooperativa_cnpj", digits)
    .eq("cooperado_id", cooperadoId)
    .maybeSingle();

  const atualLimite = atualRow ? Number(atualRow.limite_liberado_centavos) : 0;
  const usado = atualRow ? Number(atualRow.valor_usado_centavos) : 0;

  if (novoLimiteCents < usado) {
    return {
      atual: { limiteLiberadoCents: atualLimite, valorUsadoCents: usado, valorDisponivelCents: computeDisponivel(atualLimite, usado) },
      novo: novoLimiteCents,
      totalDistribuidoApos: 0,
      tetoGlobal: teto,
      ok: false,
      error: "Novo limite não pode ser menor que o valor já usado.",
    };
  }

  const distribuido = await sumLimitesDistribuidos(supabase, digits);
  const totalApos = distribuido - atualLimite + novoLimiteCents;

  if (totalApos > teto) {
    return {
      atual: { limiteLiberadoCents: atualLimite, valorUsadoCents: usado, valorDisponivelCents: computeDisponivel(atualLimite, usado) },
      novo: novoLimiteCents,
      totalDistribuidoApos: totalApos,
      tetoGlobal: teto,
      ok: false,
      error: "Ultrapassa o teto global da cooperativa.",
    };
  }

  return {
    atual: { limiteLiberadoCents: atualLimite, valorUsadoCents: usado, valorDisponivelCents: computeDisponivel(atualLimite, usado) },
    novo: novoLimiteCents,
    totalDistribuidoApos: totalApos,
    tetoGlobal: teto,
    ok: true,
  };
}

export async function setLimiteCooperado(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  novoLimiteCents: number,
  actorUserId: string
): Promise<{ ok: true; limite: ContaCoopLimiteCooperado } | { ok: false; error: string }> {
  const preview = await previewLimiteAlteracao(supabase, cnpj, cooperadoId, novoLimiteCents);
  if (!preview.ok) return { ok: false, error: preview.error! };

  const digits = normalizeCnpj(cnpj);
  const { data: existing } = await supabase
    .from("conta_coop_limites")
    .select("*")
    .eq("cooperativa_cnpj", digits)
    .eq("cooperado_id", cooperadoId)
    .maybeSingle();

  const usado = existing ? Number(existing.valor_usado_centavos) : 0;
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("conta_coop_limites")
    .upsert(
      {
        cooperativa_cnpj: digits,
        cooperado_id: cooperadoId,
        limite_liberado_centavos: novoLimiteCents,
        valor_usado_centavos: usado,
        updated_at: now,
        updated_by: actorUserId,
      },
      { onConflict: "cooperativa_cnpj,cooperado_id" }
    )
    .select()
    .single();

  if (error) return { ok: false, error: error.message };

  await supabase.from("conta_coop_ledger").insert({
    cooperativa_cnpj: digits,
    cooperado_id: cooperadoId,
    tipo: "LIMIT_RELEASE",
    amount_centavos: novoLimiteCents - preview.atual.limiteLiberadoCents,
    saldo_disponivel_apos_centavos: computeDisponivel(novoLimiteCents, usado),
    reference_type: "limite",
    reference_id: cooperadoId,
    memo: "Ajuste de limite Conta Coop",
    actor_user_id: actorUserId,
  });

  await supabase.from("conta_coop_audit").insert({
    cooperativa_cnpj: digits,
    action: "limit.updated",
    actor_user_id: actorUserId,
    entity_type: "limite",
    entity_id: cooperadoId,
    estado_anterior: preview.atual,
    estado_novo: { limiteLiberadoCents: novoLimiteCents },
  });

  return { ok: true, limite: mapLimiteRow(data as Record<string, unknown>) };
}

export async function setLimiteColetivo(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoIds: string[],
  valorPorCooperadoCents: number,
  actorUserId: string
): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  let updated = 0;
  for (const cooperadoId of cooperadoIds) {
    const result = await setLimiteCooperado(supabase, cnpj, cooperadoId, valorPorCooperadoCents, actorUserId);
    if (!result.ok) return result;
    updated++;
  }
  return { ok: true, updated };
}

export async function registerParceiro(
  supabase: SupabaseClient,
  input: {
    id: string;
    cooperativaCnpj: string;
    cnpjMercado: string;
    nomeMercado: string;
    email: string;
    appUserId: string;
  }
): Promise<ContaCoopParceiro> {
  const digits = normalizeCnpj(input.cooperativaCnpj);
  const cnpjMercado = normalizeCnpj(input.cnpjMercado);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("conta_coop_parceiros")
    .insert({
      id: input.id,
      cooperativa_cnpj: digits,
      cnpj_mercado: cnpjMercado,
      nome_mercado: input.nomeMercado.trim(),
      email: input.email.trim().toLowerCase(),
      status: "pendente",
      app_user_id: input.appUserId,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapParceiroRow(data as Record<string, unknown>);
}

export async function listParceiros(supabase: SupabaseClient, cnpj: string): Promise<ContaCoopParceiro[]> {
  const digits = normalizeCnpj(cnpj);
  const { data } = await supabase
    .from("conta_coop_parceiros")
    .select("*")
    .eq("cooperativa_cnpj", digits)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => mapParceiroRow(r as Record<string, unknown>));
}

export async function setParceiroStatus(
  supabase: SupabaseClient,
  cnpj: string,
  parceiroId: string,
  status: ParceiroStatus,
  actorUserId: string
): Promise<ContaCoopParceiro | null> {
  const digits = normalizeCnpj(cnpj);
  const { data: before } = await supabase
    .from("conta_coop_parceiros")
    .select("*")
    .eq("id", parceiroId)
    .eq("cooperativa_cnpj", digits)
    .maybeSingle();

  const { data, error } = await supabase
    .from("conta_coop_parceiros")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", parceiroId)
    .eq("cooperativa_cnpj", digits)
    .select()
    .single();

  if (error || !data) return null;

  await supabase.from("conta_coop_audit").insert({
    cooperativa_cnpj: digits,
    action: status === "ativo" ? "partner.approved" : "partner.blocked",
    actor_user_id: actorUserId,
    entity_type: "parceiro",
    entity_id: parceiroId,
    estado_anterior: before ? { status: before.status } : null,
    estado_novo: { status },
  });

  return mapParceiroRow(data as Record<string, unknown>);
}

function mapParceiroRow(row: Record<string, unknown>): ContaCoopParceiro {
  return {
    id: String(row.id),
    cooperativaCnpj: String(row.cooperativa_cnpj),
    cnpjMercado: String(row.cnpj_mercado),
    nomeMercado: String(row.nome_mercado),
    email: String(row.email),
    status: row.status as ParceiroStatus,
    appUserId: row.app_user_id ? String(row.app_user_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function getLimiteCooperado(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string
): Promise<ContaCoopLimiteCooperado | null> {
  const digits = normalizeCnpj(cnpj);
  const { data } = await supabase
    .from("conta_coop_limites")
    .select("*")
    .eq("cooperativa_cnpj", digits)
    .eq("cooperado_id", cooperadoId)
    .maybeSingle();
  return data ? mapLimiteRow(data as Record<string, unknown>) : null;
}

export async function setFinancialPin(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  pin: string
): Promise<void> {
  const pinHash = await hashPassword(pin);
  const digits = normalizeCnpj(cnpj);
  await supabase
    .from("conta_coop_limites")
    .upsert(
      {
        cooperativa_cnpj: digits,
        cooperado_id: cooperadoId,
        limite_liberado_centavos: 0,
        valor_usado_centavos: 0,
        pin_hash: pinHash,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "cooperativa_cnpj,cooperado_id" }
    );
}

export async function verifyFinancialPin(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  pin: string
): Promise<boolean> {
  const limite = await getLimiteCooperado(supabase, cnpj, cooperadoId);
  if (!limite) return false;
  const { data } = await supabase
    .from("conta_coop_limites")
    .select("pin_hash")
    .eq("cooperativa_cnpj", normalizeCnpj(cnpj))
    .eq("cooperado_id", cooperadoId)
    .maybeSingle();
  if (!data?.pin_hash) return false;
  return verifyPassword(pin, String(data.pin_hash));
}

export async function createPaymentIntent(
  supabase: SupabaseClient,
  input: {
    parceiroId: string;
    cooperativaCnpj: string;
    amountCents: number;
    descricao?: string;
  }
): Promise<ContaCoopIntent> {
  const { data: parceiro } = await supabase
    .from("conta_coop_parceiros")
    .select("*")
    .eq("id", input.parceiroId)
    .maybeSingle();

  if (!parceiro || parceiro.status !== "ativo") {
    throw new Error("Mercado não autorizado a criar cobranças.");
  }

  const id = genId("intent");
  const nonce = genId("nonce");
  const expiresAt = new Date(Date.now() + INTENT_EXPIRY_MINUTES * 60_000).toISOString();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("conta_coop_intents")
    .insert({
      id,
      cooperativa_cnpj: normalizeCnpj(input.cooperativaCnpj),
      parceiro_id: input.parceiroId,
      amount_centavos: input.amountCents,
      descricao: input.descricao?.trim() || null,
      status: "pendente",
      nonce,
      expires_at: expiresAt,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return {
    id,
    cooperativaCnpj: String(data.cooperativa_cnpj),
    parceiroId: input.parceiroId,
    parceiroNome: String(parceiro.nome_mercado),
    amountCents: input.amountCents,
    descricao: input.descricao,
    status: "pendente",
    nonce,
    expiresAt,
    createdAt: now,
  };
}

export async function validateIntentForCooperado(
  supabase: SupabaseClient,
  intentId: string,
  nonce: string,
  cooperadoId: string,
  cooperativaCnpj: string
): Promise<
  | { ok: true; intent: ContaCoopIntent; limite: ContaCoopLimiteCooperado; parceiroNome: string }
  | { ok: false; error: string }
> {
  const digits = normalizeCnpj(cooperativaCnpj);
  const { data: intent } = await supabase.from("conta_coop_intents").select("*").eq("id", intentId).maybeSingle();
  if (!intent) return { ok: false, error: "Cobrança não encontrada." };
  if (intent.cooperativa_cnpj !== digits) return { ok: false, error: "Cooperativa inválida." };
  if (intent.nonce !== nonce) return { ok: false, error: "QR inválido." };
  if (!["pendente", "criada"].includes(intent.status)) return { ok: false, error: "Cobrança já utilizada." };
  if (new Date(intent.expires_at).getTime() < Date.now()) return { ok: false, error: "Cobrança expirada." };

  const { data: parceiro } = await supabase.from("conta_coop_parceiros").select("*").eq("id", intent.parceiro_id).maybeSingle();
  if (!parceiro || parceiro.status !== "ativo") return { ok: false, error: "Mercado bloqueado ou inativo." };

  const limite = await getLimiteCooperado(supabase, digits, cooperadoId);
  if (!limite) return { ok: false, error: "Sem limite Conta Coop." };
  if (limite.bloqueado) return { ok: false, error: "Cooperado bloqueado." };
  if (limite.valorDisponivelCents < Number(intent.amount_centavos)) {
    return { ok: false, error: "Limite insuficiente." };
  }

  return {
    ok: true,
    intent: {
      id: intent.id,
      cooperativaCnpj: digits,
      parceiroId: intent.parceiro_id,
      amountCents: Number(intent.amount_centavos),
      descricao: intent.descricao ?? undefined,
      status: intent.status,
      nonce: intent.nonce,
      expiresAt: intent.expires_at,
      createdAt: intent.created_at,
    },
    limite,
    parceiroNome: String(parceiro.nome_mercado),
  };
}

export async function authorizePayment(
  supabase: SupabaseClient,
  input: {
    intentId: string;
    nonce: string;
    cooperadoId: string;
    cooperativaCnpj: string;
    idempotencyKey: string;
    pin: string;
    actorUserId: string;
  }
): Promise<
  | { ok: true; transacaoId: string; receiptCode: string; disponivelAposCents: number; duplicate?: boolean }
  | { ok: false; error: string }
> {
  const pinOk = await verifyFinancialPin(supabase, input.cooperativaCnpj, input.cooperadoId, input.pin);
  if (!pinOk) return { ok: false, error: "PIN financeiro inválido." };

  const transacaoId = genId("tx");
  const recebivelId = genId("recv");
  const receiptCode = genId("receipt").slice(-8).toUpperCase();

  const { data, error } = await supabase.rpc("conta_coop_authorize_payment", {
    p_intent_id: input.intentId,
    p_nonce: input.nonce,
    p_cooperado_id: input.cooperadoId,
    p_cooperativa_cnpj: normalizeCnpj(input.cooperativaCnpj),
    p_idempotency_key: input.idempotencyKey,
    p_transacao_id: transacaoId,
    p_recebivel_id: recebivelId,
    p_receipt_code: receiptCode,
    p_actor_user_id: input.actorUserId,
  });

  if (error) {
    if (/function.*does not exist/i.test(error.message)) {
      return { ok: false, error: "Migration Conta Coop não aplicada na nuvem." };
    }
    return { ok: false, error: error.message };
  }

  const result = data as { ok?: boolean; error?: string; duplicate?: boolean; transacao_id?: string; disponivel_apos_centavos?: number };
  if (!result?.ok) return { ok: false, error: result?.error ?? "Pagamento recusado." };

  return {
    ok: true,
    transacaoId: result.transacao_id ?? transacaoId,
    receiptCode,
    disponivelAposCents: Number(result.disponivel_apos_centavos ?? 0),
    duplicate: Boolean(result.duplicate),
  };
}

export async function listLedgerCooperado(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  limit = 30
): Promise<ContaCoopLedgerEntry[]> {
  const { data } = await supabase
    .from("conta_coop_ledger")
    .select("*")
    .eq("cooperativa_cnpj", normalizeCnpj(cnpj))
    .eq("cooperado_id", cooperadoId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((r) => ({
    id: String(r.id),
    tipo: String(r.tipo),
    amountCents: Number(r.amount_centavos),
    saldoDisponivelAposCents: r.saldo_disponivel_apos_centavos != null ? Number(r.saldo_disponivel_apos_centavos) : null,
    memo: r.memo,
    referenceType: r.reference_type,
    referenceId: r.reference_id,
    createdAt: String(r.created_at),
  }));
}

export async function getParceiroByUserId(
  supabase: SupabaseClient,
  appUserId: string
): Promise<ContaCoopParceiro | null> {
  const { data } = await supabase.from("conta_coop_parceiros").select("*").eq("app_user_id", appUserId).maybeSingle();
  return data ? mapParceiroRow(data as Record<string, unknown>) : null;
}

export async function setCooperadoBloqueado(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  bloqueado: boolean,
  actorUserId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const digits = normalizeCnpj(cnpj);
  const { data: before } = await supabase
    .from("conta_coop_limites")
    .select("*")
    .eq("cooperativa_cnpj", digits)
    .eq("cooperado_id", cooperadoId)
    .maybeSingle();

  const { error } = await supabase
    .from("conta_coop_limites")
    .update({ bloqueado, updated_at: new Date().toISOString(), updated_by: actorUserId })
    .eq("cooperativa_cnpj", digits)
    .eq("cooperado_id", cooperadoId);

  if (error) return { ok: false, error: error.message };

  await supabase.from("conta_coop_audit").insert({
    cooperativa_cnpj: digits,
    action: bloqueado ? "cooperado.blocked" : "cooperado.unblocked",
    actor_user_id: actorUserId,
    entity_type: "limite",
    entity_id: cooperadoId,
    estado_anterior: before ? { bloqueado: before.bloqueado } : null,
    estado_novo: { bloqueado },
  });

  return { ok: true };
}

export async function previewLimiteColetivo(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoIds: string[],
  valorPorCooperadoCents: number
): Promise<{
  limiteAtualTotal: number;
  novoLimiteTotal: number;
  totalApos: number;
  tetoGlobal: number;
  ok: boolean;
  error?: string;
}> {
  const digits = normalizeCnpj(cnpj);
  const teto = await getOrCreateTeto(supabase, digits);
  const distribuido = await sumLimitesDistribuidos(supabase, digits);

  let somaAtualSelecionados = 0;
  for (const cooperadoId of cooperadoIds) {
    const { data } = await supabase
      .from("conta_coop_limites")
      .select("limite_liberado_centavos")
      .eq("cooperativa_cnpj", digits)
      .eq("cooperado_id", cooperadoId)
      .maybeSingle();
    somaAtualSelecionados += data ? Number(data.limite_liberado_centavos) : 0;
  }

  const totalApos = distribuido - somaAtualSelecionados + cooperadoIds.length * valorPorCooperadoCents;

  if (totalApos > teto) {
    return {
      limiteAtualTotal: distribuido,
      novoLimiteTotal: cooperadoIds.length * valorPorCooperadoCents,
      totalApos,
      tetoGlobal: teto,
      ok: false,
      error: "Ultrapassa o teto global da cooperativa.",
    };
  }

  return {
    limiteAtualTotal: distribuido,
    novoLimiteTotal: cooperadoIds.length * valorPorCooperadoCents,
    totalApos,
    tetoGlobal: teto,
    ok: true,
  };
}

export async function cancelPaymentIntent(
  supabase: SupabaseClient,
  intentId: string,
  parceiroId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: intent } = await supabase
    .from("conta_coop_intents")
    .select("*")
    .eq("id", intentId)
    .eq("parceiro_id", parceiroId)
    .maybeSingle();

  if (!intent) return { ok: false, error: "Cobrança não encontrada." };
  if (!["pendente", "criada"].includes(intent.status)) {
    return { ok: false, error: "Cobrança não pode ser cancelada." };
  }

  const { error } = await supabase
    .from("conta_coop_intents")
    .update({ status: "cancelada", updated_at: new Date().toISOString() })
    .eq("id", intentId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function refundPayment(
  supabase: SupabaseClient,
  transacaoId: string,
  cooperativaCnpj: string,
  actorUserId: string
): Promise<{ ok: true; disponivelAposCents: number } | { ok: false; error: string }> {
  const refundLedgerId = randomUUID();

  const { data, error } = await supabase.rpc("conta_coop_refund_payment", {
    p_transacao_id: transacaoId,
    p_cooperativa_cnpj: normalizeCnpj(cooperativaCnpj),
    p_refund_ledger_id: refundLedgerId,
    p_actor_user_id: actorUserId,
  });

  if (error) {
    if (/function.*does not exist/i.test(error.message)) {
      return { ok: false, error: "Migration Conta Coop não aplicada na nuvem." };
    }
    return { ok: false, error: error.message };
  }

  const result = data as { ok?: boolean; error?: string; disponivel_apos_centavos?: number };
  if (!result?.ok) return { ok: false, error: result?.error ?? "Estorno recusado." };

  return { ok: true, disponivelAposCents: Number(result.disponivel_apos_centavos ?? 0) };
}

export async function listRecebiveisParceiro(
  supabase: SupabaseClient,
  parceiroId: string,
  limit = 20
): Promise<{ id: string; amountCents: number; status: string; createdAt: string }[]> {
  const { data } = await supabase
    .from("conta_coop_recebiveis")
    .select("id, amount_centavos, status, created_at")
    .eq("parceiro_id", parceiroId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((r) => ({
    id: String(r.id),
    amountCents: Number(r.amount_centavos),
    status: String(r.status),
    createdAt: String(r.created_at),
  }));
}

export async function listIntentsParceiro(
  supabase: SupabaseClient,
  parceiroId: string,
  limit = 10
): Promise<ContaCoopIntent[]> {
  const { data } = await supabase
    .from("conta_coop_intents")
    .select("*")
    .eq("parceiro_id", parceiroId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: String(row.id),
    cooperativaCnpj: String(row.cooperativa_cnpj),
    parceiroId: String(row.parceiro_id),
    amountCents: Number(row.amount_centavos),
    descricao: row.descricao ?? undefined,
    status: row.status as ContaCoopIntent["status"],
    nonce: String(row.nonce),
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
  }));
}

export async function hasFinancialPin(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("conta_coop_limites")
    .select("pin_hash")
    .eq("cooperativa_cnpj", normalizeCnpj(cnpj))
    .eq("cooperado_id", cooperadoId)
    .maybeSingle();
  return Boolean(data?.pin_hash);
}
