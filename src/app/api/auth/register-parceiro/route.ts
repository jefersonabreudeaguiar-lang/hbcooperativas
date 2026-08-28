import { NextResponse } from "next/server";
import { generateId } from "@/services/dataStore";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import {
  clientIp,
  ensureAuthInfrastructure,
  tokenResponseForUser,
} from "@/lib/security/authRoutes";
import { logSecurityEvent, upsertAppUser } from "@/lib/supabase/usersAuth";
import { registerParceiro } from "@/lib/supabase/contaCoopStorage";
import { normalizeCnpj, formatCnpj } from "@/utils/cooperativa";
import { assertHbCreditEnabledServer, CreditDisabledError } from "@/modules/hb-credit/config";

export async function POST(request: Request) {
  try {
    assertHbCreditEnabledServer();
  } catch (e) {
    if (e instanceof CreditDisabledError) {
      return NextResponse.json({ error: e.message, enabled: false }, { status: 404 });
    }
    throw e;
  }

  const blocked = ensureAuthInfrastructure(request);
  if (blocked) return blocked;

  const body = await request.json().catch(() => null);
  const cnpjCooperativa = normalizeCnpj(String(body?.cooperativaCnpj ?? ""));
  const cnpjMercado = normalizeCnpj(String(body?.cnpjMercado ?? ""));
  const nomeMercado = String(body?.nomeMercado ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  const name = String(body?.name ?? nomeMercado).trim();

  if (cnpjCooperativa.length !== 14 || cnpjMercado.length !== 14 || !nomeMercado || !email || password.length < 6) {
    return NextResponse.json(
      { error: "Preencha CNPJ da cooperativa, CNPJ do mercado, nome, e-mail e senha (mín. 6)." },
      { status: 400 }
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Cadastro na nuvem indisponível." }, { status: 503 });
  }

  const supabase = getSupabaseAdmin()!;
  const { data: coop } = await supabase
    .from("cooperativas")
    .select("id, nome, cnpj, status")
    .eq("cnpj", cnpjCooperativa)
    .eq("status", "ativa")
    .maybeSingle();

  if (!coop) {
    return NextResponse.json(
      { error: `Cooperativa ${formatCnpj(cnpjCooperativa)} não encontrada. Verifique o CNPJ.` },
      { status: 400 }
    );
  }

  const userId = generateId("u");
  const parceiroId = generateId("parceiro");

  const user = await upsertAppUser(supabase, {
    id: userId,
    email,
    password,
    name,
    role: "parceiro",
    cooperativaId: coop.id,
    cooperativaCnpj: cnpjCooperativa,
  });

  if (!user) {
    return NextResponse.json({ error: "Não foi possível criar usuário na nuvem." }, { status: 503 });
  }

  await supabase.from("app_users").update({ parceiro_id: parceiroId }).eq("id", userId);

  await registerParceiro(supabase, {
    id: parceiroId,
    cooperativaCnpj: cnpjCooperativa,
    cnpjMercado,
    nomeMercado,
    email,
    appUserId: userId,
  });

  await logSecurityEvent(supabase, {
    action: "credit.partner.register",
    userId,
    userEmail: email,
    cooperativaCnpj: cnpjCooperativa,
    ip: clientIp(request),
    metadata: { parceiroId, cnpjMercado, status: "pendente" },
  });

  return tokenResponseForUser({ ...user, role: "parceiro" });
}
