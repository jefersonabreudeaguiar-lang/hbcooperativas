import { NextResponse } from "next/server";
import { getParceiroByUserId } from "@/lib/supabase/contaCoopStorage";
import { fetchCooperadosFromStorage } from "@/lib/supabase/cooperadosStorage";
import { requireCreditApi } from "@/lib/security/creditGuard";
import { normalizeCnpj } from "@/utils/cooperativa";
import type { Cooperado } from "@/types";

interface RouteParams {
  params: Promise<{ transactionId: string }>;
}

function pickCooperadoFiscalDoc(c: Cooperado) {
  return {
    nomeCompleto: c.nomeCompleto?.trim() ?? "",
    cpf: c.cpfCnpj?.trim() ?? "",
    celular: c.telefone?.trim() ?? "",
    endereco: c.endereco?.trim() ?? "",
    rg: c.rg?.trim() ?? "",
  };
}

export async function GET(request: Request, context: RouteParams) {
  const gate = await requireCreditApi(request, { requireOperations: true });
  if (!gate.ok) return gate.response;

  if (gate.ctx.session?.role !== "parceiro" && gate.ctx.enforced) {
    return NextResponse.json({ error: "Acesso restrito ao mercado." }, { status: 403 });
  }

  const parceiro = gate.ctx.session
    ? await getParceiroByUserId(gate.ctx.supabase, gate.ctx.session.sub)
    : null;
  if (!parceiro) {
    return NextResponse.json({ error: "Mercado não vinculado." }, { status: 404 });
  }

  const { transactionId } = await context.params;
  if (!transactionId?.trim()) {
    return NextResponse.json({ error: "Transação inválida." }, { status: 400 });
  }

  const { data: tx, error: txErr } = await gate.ctx.supabase
    .from("hb_credit_transactions")
    .select("cooperative_cnpj, cooperado_id, partner_id")
    .eq("id", transactionId)
    .eq("event_type", "PAYMENT")
    .eq("status", "posted")
    .maybeSingle();

  if (txErr || !tx) {
    return NextResponse.json({ error: "Venda não encontrada." }, { status: 404 });
  }
  if (String(tx.partner_id) !== parceiro.id) {
    return NextResponse.json({ error: "Venda não pertence a este mercado." }, { status: 403 });
  }

  const cnpj = normalizeCnpj(String(tx.cooperative_cnpj ?? ""));
  const cooperadoId = String(tx.cooperado_id ?? "");
  if (cnpj.length !== 14 || !cooperadoId) {
    return NextResponse.json({ error: "Dados da venda incompletos." }, { status: 400 });
  }

  const cooperados = await fetchCooperadosFromStorage(gate.ctx.supabase, cnpj);
  const cooperado = cooperados.find((c) => c.id === cooperadoId);
  if (!cooperado) {
    return NextResponse.json({
      ok: true,
      doc: {
        nomeCompleto: "",
        cpf: "",
        celular: "",
        endereco: "",
        rg: "",
      },
      aviso: "Cadastro do cooperado ainda não sincronizado na nuvem.",
    });
  }

  return NextResponse.json({ ok: true, doc: pickCooperadoFiscalDoc(cooperado) });
}
