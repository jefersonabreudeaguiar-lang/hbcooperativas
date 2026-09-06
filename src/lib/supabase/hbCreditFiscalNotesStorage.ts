import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCnpj } from "@/utils/cooperativa";
import type { ContaCoopFiscalNote, ContaCoopFiscalNotesResumo, FiscalNoteStatus } from "@/modules/hb-credit/types";
import {
  fiscalNoteStatusFromDb,
  fiscalNoteStatusToDb,
} from "@/modules/hb-credit/infrastructure/mappers/statusMapper";

const BUCKET = "hb-conta-coop-nf";

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomBytes(6).toString("hex")}`;
}

function mesReferenciaFromIso(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function mesReferenciaRange(mesReferencia: string): { start: string; end: string } {
  const [year, month] = mesReferencia.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const end = new Date(Date.UTC(year, month, 1)).toISOString();
  return { start, end };
}

function mapFiscalNoteRow(row: Record<string, unknown>): ContaCoopFiscalNote {
  return {
    id: String(row.id),
    transactionId: String(row.transaction_id),
    receivableId: row.receivable_id ? String(row.receivable_id) : null,
    partnerId: String(row.partner_id),
    cooperadoId: String(row.cooperado_id),
    cooperadoNome: row.cooperado_nome_snapshot ? String(row.cooperado_nome_snapshot) : null,
    mesReferencia: String(row.mes_referencia),
    saleAmountCents: Number(row.sale_amount_cents),
    status: fiscalNoteStatusFromDb(String(row.status)),
    photoStoragePath: row.photo_storage_path ? String(row.photo_storage_path) : null,
    nfNumber: row.nf_number ? String(row.nf_number) : null,
    nfIssuedToName: row.nf_issued_to_name ? String(row.nf_issued_to_name) : null,
    nfDate: row.nf_date ? String(row.nf_date) : null,
    nfAmountCents: row.nf_amount_cents != null ? Number(row.nf_amount_cents) : null,
    rejectReason: row.reject_reason ? String(row.reject_reason) : null,
    reviewedByName: row.reviewed_by_name ? String(row.reviewed_by_name) : null,
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    receiptCode: row.receipt_code ? String(row.receipt_code) : null,
    descricao: row.descricao ? String(row.descricao) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function ensureFiscalNotesBucket(supabase: SupabaseClient): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === BUCKET)) return;
  await supabase.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 15 * 1024 * 1024 });
}

function fiscalPhotoPath(cnpj: string, transactionId: string): string {
  return `${normalizeCnpj(cnpj)}/${transactionId}.jpg`;
}

async function fetchPaymentTransaction(
  supabase: SupabaseClient,
  transactionId: string,
  cooperativeCnpj?: string
): Promise<Record<string, unknown> | null> {
  let builder = supabase
    .from("hb_credit_transactions")
    .select("id, cooperative_cnpj, partner_id, cooperado_id, amount_cents, created_at, receipt_code, payment_intent_id, status, event_type")
    .eq("id", transactionId)
    .eq("event_type", "PAYMENT")
    .eq("status", "posted");
  if (cooperativeCnpj) {
    builder = builder.eq("cooperative_cnpj", normalizeCnpj(cooperativeCnpj));
  }
  const { data } = await builder.maybeSingle();
  return data as Record<string, unknown> | null;
}

async function fetchReceivableForTransaction(
  supabase: SupabaseClient,
  transactionId: string
): Promise<{ id: string; status: string } | null> {
  const { data } = await supabase
    .from("hb_credit_receivables")
    .select("id, status")
    .eq("transaction_id", transactionId)
    .maybeSingle();
  if (!data) return null;
  return { id: String(data.id), status: String(data.status) };
}

/** Compras estornadas ou revertidas não entram na fila de NF. */
async function fetchNonFiscalTransactionIds(
  supabase: SupabaseClient,
  transactionIds: string[]
): Promise<Set<string>> {
  const blocked = new Set<string>();
  if (!transactionIds.length) return blocked;

  const [{ data: refunds }, { data: txs }] = await Promise.all([
    supabase
      .from("hb_credit_refunds")
      .select("original_transaction_id")
      .in("original_transaction_id", transactionIds),
    supabase.from("hb_credit_transactions").select("id, status").in("id", transactionIds),
  ]);

  for (const row of refunds ?? []) {
    blocked.add(String(row.original_transaction_id));
  }
  for (const tx of txs ?? []) {
    if (String(tx.status) === "reversed") blocked.add(String(tx.id));
  }

  return blocked;
}

async function filterFiscalNotesForActiveSales(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
  actorUserId = "system"
): Promise<Record<string, unknown>[]> {
  if (!rows.length) return rows;

  const blocked = await fetchNonFiscalTransactionIds(
    supabase,
    rows.map((row) => String(row.transaction_id))
  );
  if (!blocked.size) return rows;

  const active: Record<string, unknown>[] = [];
  for (const row of rows) {
    const txId = String(row.transaction_id);
    if (!blocked.has(txId)) {
      active.push(row);
      continue;
    }
    if (String(row.status) !== "CANCELLED") {
      await cancelFiscalNoteForTransaction(supabase, txId, actorUserId);
    }
  }
  return active;
}

/** Cria registro fiscal após pagamento confirmado (idempotente). */
export async function ensureFiscalNoteForTransaction(
  supabase: SupabaseClient,
  transactionId: string,
  cooperadoNome?: string | null
): Promise<ContaCoopFiscalNote | null> {
  const { data: existing } = await supabase
    .from("hb_credit_fiscal_notes")
    .select("*")
    .eq("transaction_id", transactionId)
    .maybeSingle();

  const tx = await fetchPaymentTransaction(supabase, transactionId);
  if (!tx) {
    if (existing && String(existing.status) !== "CANCELLED") {
      await cancelFiscalNoteForTransaction(supabase, transactionId, "system");
    }
    return null;
  }

  const blocked = await fetchNonFiscalTransactionIds(supabase, [transactionId]);
  if (blocked.has(transactionId)) {
    if (existing && String(existing.status) !== "CANCELLED") {
      await cancelFiscalNoteForTransaction(supabase, transactionId, "system");
    }
    return null;
  }

  if (existing) {
    if (String(existing.status) === "CANCELLED") return null;
    if (cooperadoNome?.trim() && !existing.cooperado_nome_snapshot) {
      await supabase
        .from("hb_credit_fiscal_notes")
        .update({
          cooperado_nome_snapshot: cooperadoNome.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", String(existing.id));
    }
    return mapFiscalNoteRow(existing as Record<string, unknown>);
  }

  const receivable = await fetchReceivableForTransaction(supabase, transactionId);
  const now = new Date().toISOString();
  const id = genId("fiscal");
  const mesReferencia = mesReferenciaFromIso(String(tx.created_at));

  const row = {
    id,
    cooperative_cnpj: String(tx.cooperative_cnpj),
    transaction_id: transactionId,
    receivable_id: receivable?.id ?? null,
    partner_id: String(tx.partner_id),
    cooperado_id: String(tx.cooperado_id),
    cooperado_nome_snapshot: cooperadoNome?.trim() || null,
    mes_referencia: mesReferencia,
    sale_amount_cents: Number(tx.amount_cents),
    status: "PENDING_UPLOAD",
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase.from("hb_credit_fiscal_notes").insert(row).select().single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      const { data: retry } = await supabase
        .from("hb_credit_fiscal_notes")
        .select("*")
        .eq("transaction_id", transactionId)
        .maybeSingle();
      return retry ? mapFiscalNoteRow(retry as Record<string, unknown>) : null;
    }
    return null;
  }

  await supabase.from("hb_credit_audit_log").insert({
    cooperative_cnpj: String(tx.cooperative_cnpj),
    actor: "system",
    action: "FISCAL_NOTE_CREATED",
    resource_type: "fiscal_note",
    resource_id: id,
    metadata: { transactionId, partnerId: tx.partner_id, cooperadoId: tx.cooperado_id },
  });

  return mapFiscalNoteRow(data as Record<string, unknown>);
}

/** Cancela NF quando compra é estornada. */
export async function cancelFiscalNoteForTransaction(
  supabase: SupabaseClient,
  transactionId: string,
  actorUserId: string
): Promise<void> {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("hb_credit_fiscal_notes")
    .select("id, cooperative_cnpj, status, photo_storage_path")
    .eq("transaction_id", transactionId)
    .maybeSingle();
  if (!data || String(data.status) === "CANCELLED") return;

  await supabase
    .from("hb_credit_fiscal_notes")
    .update({
      status: "CANCELLED",
      updated_at: now,
    })
    .eq("id", String(data.id));

  if (data.photo_storage_path) {
    await supabase.storage.from(BUCKET).remove([String(data.photo_storage_path)]);
  }

  await supabase.from("hb_credit_audit_log").insert({
    cooperative_cnpj: String(data.cooperative_cnpj),
    actor: actorUserId,
    action: "FISCAL_NOTE_CANCELLED",
    resource_type: "fiscal_note",
    resource_id: String(data.id),
    metadata: { transactionId },
  });
}

async function enrichFiscalNotes(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[]
): Promise<ContaCoopFiscalNote[]> {
  const txIds = rows.map((r) => String(r.transaction_id));
  const intentIds: string[] = [];

  const { data: txs } = await supabase
    .from("hb_credit_transactions")
    .select("id, receipt_code, payment_intent_id")
    .in("id", txIds);

  const txMeta: Record<string, { receiptCode?: string; intentId?: string }> = {};
  for (const tx of txs ?? []) {
    txMeta[String(tx.id)] = {
      receiptCode: tx.receipt_code ? String(tx.receipt_code) : undefined,
      intentId: tx.payment_intent_id ? String(tx.payment_intent_id) : undefined,
    };
    if (tx.payment_intent_id) intentIds.push(String(tx.payment_intent_id));
  }

  const intentDesc: Record<string, string> = {};
  if (intentIds.length) {
    const { data: intents } = await supabase
      .from("hb_credit_payment_intents")
      .select("id, description")
      .in("id", intentIds);
    for (const intent of intents ?? []) {
      if (intent.description) intentDesc[String(intent.id)] = String(intent.description);
    }
  }

  return rows.map((row) => {
    const meta = txMeta[String(row.transaction_id)] ?? {};
    return mapFiscalNoteRow({
      ...row,
      receipt_code: meta.receiptCode ?? null,
      descricao: meta.intentId ? intentDesc[meta.intentId] ?? null : null,
    });
  });
}

async function syncPartnerFiscalNotesForMonth(
  supabase: SupabaseClient,
  partnerId: string,
  mesReferencia: string
): Promise<void> {
  const { data: partner } = await supabase
    .from("hb_credit_partners")
    .select("cooperative_cnpj")
    .eq("id", partnerId)
    .maybeSingle();
  if (!partner) return;

  const digits = String(partner.cooperative_cnpj);
  const { start, end } = mesReferenciaRange(mesReferencia);

  const { data: txs } = await supabase
    .from("hb_credit_transactions")
    .select("id")
    .eq("cooperative_cnpj", digits)
    .eq("partner_id", partnerId)
    .eq("event_type", "PAYMENT")
    .eq("status", "posted")
    .gte("created_at", start)
    .lt("created_at", end);

  const txIds = (txs ?? []).map((tx) => String(tx.id));
  const blocked = await fetchNonFiscalTransactionIds(supabase, txIds);

  for (const txId of txIds) {
    if (blocked.has(txId)) continue;
    await ensureFiscalNoteForTransaction(supabase, txId);
  }
}

export async function listPartnerFiscalNotes(
  supabase: SupabaseClient,
  partnerId: string,
  mesReferencia: string
): Promise<ContaCoopFiscalNote[]> {
  await syncPartnerFiscalNotesForMonth(supabase, partnerId, mesReferencia);

  const { data } = await supabase
    .from("hb_credit_fiscal_notes")
    .select("*")
    .eq("partner_id", partnerId)
    .eq("mes_referencia", mesReferencia)
    .neq("status", "CANCELLED")
    .order("created_at", { ascending: false });

  const activeRows = await filterFiscalNotesForActiveSales(supabase, (data ?? []) as Record<string, unknown>[]);
  return enrichFiscalNotes(supabase, activeRows);
}

export async function listStaffFiscalNotes(
  supabase: SupabaseClient,
  cnpj: string,
  mesReferencia: string,
  options?: { partnerId?: string; status?: FiscalNoteStatus }
): Promise<ContaCoopFiscalNote[]> {
  const digits = normalizeCnpj(cnpj);

  const { data: partners } = await supabase
    .from("hb_credit_partners")
    .select("id")
    .eq("cooperative_cnpj", digits);
  for (const p of partners ?? []) {
    await syncPartnerFiscalNotesForMonth(supabase, String(p.id), mesReferencia);
  }

  let query = supabase
    .from("hb_credit_fiscal_notes")
    .select("*")
    .eq("cooperative_cnpj", digits)
    .eq("mes_referencia", mesReferencia)
    .neq("status", "CANCELLED")
    .order("created_at", { ascending: true });

  if (options?.partnerId) query = query.eq("partner_id", options.partnerId);
  if (options?.status) query = query.eq("status", fiscalNoteStatusToDb(options.status));

  const { data } = await query;
  const activeRows = await filterFiscalNotesForActiveSales(supabase, (data ?? []) as Record<string, unknown>[]);
  return enrichFiscalNotes(supabase, activeRows);
}

export async function summarizeFiscalNotesMonth(
  supabase: SupabaseClient,
  cnpj: string,
  mesReferencia: string,
  partnerId?: string
): Promise<ContaCoopFiscalNotesResumo> {
  const notas = await listStaffFiscalNotes(supabase, cnpj, mesReferencia, { partnerId });
  const active = notas.filter((n) => n.status !== "cancelada");

  return {
    mesReferencia,
    partnerId,
    totalVendasCents: active.reduce((s, n) => s + n.saleAmountCents, 0),
    totalConferidasCents: active
      .filter((n) => n.status === "conferida")
      .reduce((s, n) => s + n.saleAmountCents, 0),
    pendentesAnexo: active.filter((n) => n.status === "pendente_anexo").length,
    aguardandoConferencia: active.filter((n) => n.status === "aguardando_conferencia").length,
    correcaoPedida: active.filter((n) => n.status === "correcao_pedida").length,
    conferidas: active.filter((n) => n.status === "conferida").length,
    totalVendas: active.length,
  };
}

export async function uploadFiscalNotePhoto(
  supabase: SupabaseClient,
  partnerId: string,
  transactionId: string,
  buffer: Buffer,
  mimeType: string
): Promise<{ ok: true; nota: ContaCoopFiscalNote } | { ok: false; error: string }> {
  const tx = await fetchPaymentTransaction(supabase, transactionId);
  if (!tx || String(tx.partner_id) !== partnerId) {
    return { ok: false, error: "Venda não encontrada." };
  }

  const receivable = await fetchReceivableForTransaction(supabase, transactionId);
  if (receivable?.status === "SETTLED" || receivable?.status === "PROCESSING") {
    return { ok: false, error: "Esta venda já está em liquidação." };
  }

  await ensureFiscalNoteForTransaction(supabase, transactionId);

  const { data: nota } = await supabase
    .from("hb_credit_fiscal_notes")
    .select("*")
    .eq("transaction_id", transactionId)
    .maybeSingle();

  if (!nota) return { ok: false, error: "Registro fiscal não encontrado." };
  const status = String(nota.status);
  if (status === "CANCELLED") return { ok: false, error: "Compra cancelada — NF não aplicável." };
  if (status === "APPROVED") return { ok: false, error: "NF já conferida pela cooperativa." };
  if (status === "AWAITING_REVIEW") {
    return { ok: false, error: "NF já enviada — aguardando conferência da cooperativa." };
  }

  await ensureFiscalNotesBucket(supabase);
  const path = fiscalPhotoPath(String(tx.cooperative_cnpj), transactionId);
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: true,
  });
  if (uploadError) return { ok: false, error: "Erro ao enviar imagem da NF." };

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("hb_credit_fiscal_notes")
    .update({
      photo_storage_path: path,
      status: "AWAITING_REVIEW",
      nf_number: null,
      nf_issued_to_name: null,
      nf_date: null,
      nf_amount_cents: null,
      reject_reason: null,
      reviewed_by: null,
      reviewed_by_name: null,
      reviewed_at: null,
      updated_at: now,
    })
    .eq("id", String(nota.id))
    .select()
    .single();

  if (error || !updated) return { ok: false, error: "Erro ao registrar NF." };

  await supabase.from("hb_credit_audit_log").insert({
    cooperative_cnpj: String(tx.cooperative_cnpj),
    actor: partnerId,
    action: "FISCAL_NOTE_UPLOADED",
    resource_type: "fiscal_note",
    resource_id: String(nota.id),
    metadata: { transactionId },
  });

  const enriched = await enrichFiscalNotes(supabase, [updated as Record<string, unknown>]);
  return { ok: true, nota: enriched[0] };
}

export async function getFiscalNotePhotoSignedUrl(
  supabase: SupabaseClient,
  photoPath: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(photoPath, expiresInSeconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function approveFiscalNote(
  supabase: SupabaseClient,
  params: {
    cnpj: string;
    transactionId: string;
    nfNumber: string;
    nfIssuedToName: string;
    nfDate: string;
    nfAmountCents: number;
    reviewerUserId: string;
    reviewerName: string;
  }
): Promise<{ ok: true; nota: ContaCoopFiscalNote } | { ok: false; error: string }> {
  const digits = normalizeCnpj(params.cnpj);
  const { data: nota } = await supabase
    .from("hb_credit_fiscal_notes")
    .select("*")
    .eq("transaction_id", params.transactionId)
    .eq("cooperative_cnpj", digits)
    .maybeSingle();

  if (!nota) return { ok: false, error: "NF não encontrada." };
  if (String(nota.status) === "CANCELLED") return { ok: false, error: "Compra cancelada." };
  if (String(nota.status) === "APPROVED") return { ok: false, error: "NF já conferida." };
  if (!nota.photo_storage_path) return { ok: false, error: "Mercado ainda não enviou a foto da NF." };
  if (String(nota.status) !== "AWAITING_REVIEW" && String(nota.status) !== "REJECTED") {
    return { ok: false, error: "NF não está aguardando conferência." };
  }

  const saleAmount = Number(nota.sale_amount_cents);
  if (params.nfAmountCents !== saleAmount) {
    return {
      ok: false,
      error: `Valor da NF (${(params.nfAmountCents / 100).toFixed(2)}) deve ser igual ao da venda (${(saleAmount / 100).toFixed(2)}).`,
    };
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("hb_credit_fiscal_notes")
    .update({
      status: "APPROVED",
      nf_number: params.nfNumber.trim(),
      nf_issued_to_name: params.nfIssuedToName.trim(),
      nf_date: params.nfDate,
      nf_amount_cents: params.nfAmountCents,
      reject_reason: null,
      reviewed_by: params.reviewerUserId,
      reviewed_by_name: params.reviewerName,
      reviewed_at: now,
      updated_at: now,
    })
    .eq("id", String(nota.id))
    .select()
    .single();

  if (error || !updated) return { ok: false, error: "Erro ao conferir NF." };

  if (nota.receivable_id) {
    await supabase
      .from("hb_credit_receivables")
      .update({ status: "ELIGIBLE", updated_at: now })
      .eq("id", String(nota.receivable_id))
      .in("status", ["OPEN", "BLOCKED_FOR_REVIEW"]);
  }

  await supabase.from("hb_credit_audit_log").insert({
    cooperative_cnpj: digits,
    actor: params.reviewerUserId,
    action: "FISCAL_NOTE_APPROVED",
    resource_type: "fiscal_note",
    resource_id: String(nota.id),
    metadata: {
      transactionId: params.transactionId,
      nfNumber: params.nfNumber,
      nfAmountCents: params.nfAmountCents,
    },
  });

  const enriched = await enrichFiscalNotes(supabase, [updated as Record<string, unknown>]);
  return { ok: true, nota: enriched[0] };
}

export async function rejectFiscalNote(
  supabase: SupabaseClient,
  params: {
    cnpj: string;
    transactionId: string;
    reason: string;
    reviewerUserId: string;
    reviewerName: string;
  }
): Promise<{ ok: true; nota: ContaCoopFiscalNote } | { ok: false; error: string }> {
  const digits = normalizeCnpj(params.cnpj);
  const { data: nota } = await supabase
    .from("hb_credit_fiscal_notes")
    .select("*")
    .eq("transaction_id", params.transactionId)
    .eq("cooperative_cnpj", digits)
    .maybeSingle();

  if (!nota) return { ok: false, error: "NF não encontrada." };
  if (String(nota.status) !== "AWAITING_REVIEW") {
    return { ok: false, error: "Somente NFs aguardando conferência podem ser devolvidas." };
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("hb_credit_fiscal_notes")
    .update({
      status: "REJECTED",
      reject_reason: params.reason.trim() || "Correção solicitada pela cooperativa.",
      reviewed_by: params.reviewerUserId,
      reviewed_by_name: params.reviewerName,
      reviewed_at: now,
      updated_at: now,
    })
    .eq("id", String(nota.id))
    .select()
    .single();

  if (error || !updated) return { ok: false, error: "Erro ao pedir correção." };

  await supabase.from("hb_credit_audit_log").insert({
    cooperative_cnpj: digits,
    actor: params.reviewerUserId,
    action: "FISCAL_NOTE_REJECTED",
    resource_type: "fiscal_note",
    resource_id: String(nota.id),
    metadata: { transactionId: params.transactionId, reason: params.reason },
  });

  const enriched = await enrichFiscalNotes(supabase, [updated as Record<string, unknown>]);
  return { ok: true, nota: enriched[0] };
}

export async function getFiscalNoteByTransaction(
  supabase: SupabaseClient,
  cnpj: string,
  transactionId: string
): Promise<ContaCoopFiscalNote | null> {
  const { data } = await supabase
    .from("hb_credit_fiscal_notes")
    .select("*")
    .eq("cooperative_cnpj", normalizeCnpj(cnpj))
    .eq("transaction_id", transactionId)
    .maybeSingle();
  if (!data) return null;
  if (String(data.status) === "CANCELLED") return null;
  const blocked = await fetchNonFiscalTransactionIds(supabase, [transactionId]);
  if (blocked.has(transactionId)) {
    if (String(data.status) !== "CANCELLED") {
      await cancelFiscalNoteForTransaction(supabase, transactionId, "system");
    }
    return null;
  }
  const enriched = await enrichFiscalNotes(supabase, [data as Record<string, unknown>]);
  return enriched[0] ?? null;
}

/** Trava de liquidação — só libera PIX quando todas as NFs do mês estiverem conferidas. */
export function evaluatePartnerFiscalSettlementGate(resumo: ContaCoopFiscalNotesResumo): {
  ready: boolean;
  message: string | null;
} {
  if (resumo.totalVendas === 0) {
    return { ready: false, message: "Nenhuma venda HB Créditos neste mês para liquidar." };
  }
  if (resumo.pendentesAnexo > 0) {
    return {
      ready: false,
      message: `${resumo.pendentesAnexo} venda(s) sem NF — mercado deve anexar antes do pagamento.`,
    };
  }
  if (resumo.aguardandoConferencia > 0) {
    return {
      ready: false,
      message: `${resumo.aguardandoConferencia} NF(s) aguardando conferência na aba Conferir NFs.`,
    };
  }
  if (resumo.correcaoPedida > 0) {
    return {
      ready: false,
      message: `${resumo.correcaoPedida} NF(s) com correção pedida — mercado deve reenviar.`,
    };
  }
  if (resumo.totalConferidasCents !== resumo.totalVendasCents) {
    return {
      ready: false,
      message: "Total conferido por NF não bate com vendas do mês.",
    };
  }
  return { ready: true, message: null };
}

export async function countPartnerFiscalPending(
  supabase: SupabaseClient,
  partnerId: string,
  mesReferencia: string
): Promise<number> {
  await syncPartnerFiscalNotesForMonth(supabase, partnerId, mesReferencia);
  const { data: rows } = await supabase
    .from("hb_credit_fiscal_notes")
    .select("id, transaction_id, status")
    .eq("partner_id", partnerId)
    .eq("mes_referencia", mesReferencia)
    .in("status", ["PENDING_UPLOAD", "AWAITING_REVIEW", "REJECTED"]);

  const activeRows = await filterFiscalNotesForActiveSales(
    supabase,
    (rows ?? []) as Record<string, unknown>[]
  );
  return activeRows.filter((row) =>
    ["PENDING_UPLOAD", "AWAITING_REVIEW", "REJECTED"].includes(String(row.status))
  ).length;
}

export async function countCooperativeFiscalPending(
  supabase: SupabaseClient,
  cnpj: string,
  mesReferencia: string
): Promise<{ conferir: number; mercadoPendente: number }> {
  const digits = normalizeCnpj(cnpj);
  const { data: partners } = await supabase
    .from("hb_credit_partners")
    .select("id")
    .eq("cooperative_cnpj", digits)
    .eq("status", "ACTIVE");

  let conferir = 0;
  let mercadoPendente = 0;
  for (const p of partners ?? []) {
    await syncPartnerFiscalNotesForMonth(supabase, String(p.id), mesReferencia);
  }

  const { data: rows } = await supabase
    .from("hb_credit_fiscal_notes")
    .select("status, transaction_id")
    .eq("cooperative_cnpj", digits)
    .eq("mes_referencia", mesReferencia)
    .neq("status", "CANCELLED");

  const activeRows = await filterFiscalNotesForActiveSales(
    supabase,
    (rows ?? []) as Record<string, unknown>[]
  );

  for (const row of activeRows) {
    const st = String(row.status);
    if (st === "AWAITING_REVIEW") conferir += 1;
    if (st === "PENDING_UPLOAD" || st === "REJECTED") mercadoPendente += 1;
  }

  return { conferir, mercadoPendente };
}
