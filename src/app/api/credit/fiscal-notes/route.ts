import { NextResponse } from "next/server";
import {
  approveFiscalNote,
  getFiscalNoteByTransaction,
  getFiscalNotePhotoSignedUrl,
  listPartnerFiscalNotes,
  listStaffFiscalNotes,
  rejectFiscalNote,
  summarizeFiscalNotesMonth,
} from "@/lib/supabase/hbCreditFiscalNotesStorage";
import { getParceiroByUserId } from "@/lib/supabase/contaCoopStorage";
import {
  requireCreditApi,
  requireCreditCnpj,
  requireCreditCooperativeFinance,
} from "@/lib/security/creditGuard";
import { normalizeCnpj } from "@/utils/cooperativa";
import { getCurrentMesReferencia } from "@/utils/format";
import type { FiscalNoteStatus } from "@/modules/hb-credit/types";

const VALID_STATUS: FiscalNoteStatus[] = [
  "pendente_anexo",
  "aguardando_conferencia",
  "conferida",
  "correcao_pedida",
];

export async function GET(request: Request) {
  const gate = await requireCreditApi(request);
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const mesReferencia = url.searchParams.get("mesReferencia") ?? getCurrentMesReferencia();
  const statusParam = url.searchParams.get("status") as FiscalNoteStatus | null;
  const partnerIdParam = url.searchParams.get("partnerId") ?? undefined;
  const transactionId = url.searchParams.get("transactionId") ?? "";
  const view = url.searchParams.get("view") ?? "";

  if (gate.ctx.session?.role === "parceiro") {
    const parceiro = await getParceiroByUserId(gate.ctx.supabase, gate.ctx.session.sub);
    if (!parceiro) return NextResponse.json({ error: "Mercado não vinculado." }, { status: 404 });
    const vendas = await listPartnerFiscalNotes(gate.ctx.supabase, parceiro.id, mesReferencia);
    return NextResponse.json({ ok: true, vendas, mesReferencia });
  }

  const cnpj = url.searchParams.get("cnpj") ?? "";
  if (cnpj.length !== 14 && normalizeCnpj(cnpj).length !== 14) {
    return NextResponse.json({ error: "Informe cnpj válido." }, { status: 400 });
  }
  const digits = normalizeCnpj(cnpj);
  const denyCoop = requireCreditCnpj(gate.ctx, digits);
  if (denyCoop) return denyCoop;
  const denyFinance = requireCreditCooperativeFinance(gate.ctx);
  if (denyFinance) return denyFinance;

  if (transactionId) {
    const nota = await getFiscalNoteByTransaction(gate.ctx.supabase, digits, transactionId);
    if (!nota) return NextResponse.json({ error: "NF não encontrada." }, { status: 404 });

    let photoUrl: string | null = null;
    if (nota.photoStoragePath && view === "photo") {
      photoUrl = await getFiscalNotePhotoSignedUrl(gate.ctx.supabase, nota.photoStoragePath);
    }
    return NextResponse.json({ ok: true, nota, photoUrl });
  }

  const status =
    statusParam && VALID_STATUS.includes(statusParam) ? statusParam : undefined;
  const [notas, resumo] = await Promise.all([
    listStaffFiscalNotes(gate.ctx.supabase, digits, mesReferencia, {
      partnerId: partnerIdParam,
      status,
    }),
    summarizeFiscalNotesMonth(gate.ctx.supabase, digits, mesReferencia, partnerIdParam),
  ]);

  return NextResponse.json({ ok: true, notas, resumo, mesReferencia });
}

export async function POST(request: Request) {
  const gate = await requireCreditApi(request, { requireOperations: true });
  if (!gate.ok) return gate.response;

  const denyFinance = requireCreditCooperativeFinance(gate.ctx);
  if (denyFinance) return denyFinance;

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    cnpj?: string;
    transactionId?: string;
    nfNumber?: string;
    nfIssuedToName?: string;
    nfDate?: string;
    nfAmountReais?: number;
    reason?: string;
    responsavelNome?: string;
  };

  const cnpj = normalizeCnpj(String(body.cnpj ?? gate.ctx.session?.cooperativaCnpj ?? ""));
  if (cnpj.length !== 14) {
    return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
  }
  const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
  if (denyCoop) return denyCoop;

  const transactionId = String(body.transactionId ?? "");
  if (!transactionId) {
    return NextResponse.json({ error: "Informe transactionId." }, { status: 400 });
  }

  const reviewerUserId = gate.ctx.session?.sub ?? "staff";
  const reviewerName = String(body.responsavelNome ?? gate.ctx.session?.name ?? "Responsável");

  if (body.action === "approve") {
    const nfNumber = String(body.nfNumber ?? "").trim();
    const nfIssuedToName = String(body.nfIssuedToName ?? "").trim();
    const nfDate = String(body.nfDate ?? "").trim();
    const nfAmountReais = Number(body.nfAmountReais);
    if (!nfNumber || !nfIssuedToName || !nfDate || !Number.isFinite(nfAmountReais)) {
      return NextResponse.json({ error: "Preencha número, nome, data e valor da NF." }, { status: 400 });
    }
    const nfAmountCents = Math.round(nfAmountReais * 100);
    const result = await approveFiscalNote(gate.ctx.supabase, {
      cnpj,
      transactionId,
      nfNumber,
      nfIssuedToName,
      nfDate,
      nfAmountCents,
      reviewerUserId,
      reviewerName,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, nota: result.nota });
  }

  if (body.action === "reject") {
    const result = await rejectFiscalNote(gate.ctx.supabase, {
      cnpj,
      transactionId,
      reason: String(body.reason ?? "").trim(),
      reviewerUserId,
      reviewerName,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, nota: result.nota });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
