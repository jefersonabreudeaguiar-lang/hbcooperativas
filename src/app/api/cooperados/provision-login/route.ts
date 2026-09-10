import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeCnpj } from "@/utils/cooperativa";
import { guardCooperativaApi } from "@/lib/security/apiGuard";
import { clientIp } from "@/lib/security/authRoutes";
import { normalizeAuthEmail } from "@/lib/security/appCreator";
import {
  findAppUserByCooperadoId,
  findAppUserByEmail,
  logSecurityEvent,
  upsertAppUserWithRoleRepair,
} from "@/lib/supabase/usersAuth";

type ProvisionLoginBody = {
  id?: string;
  cooperadoId?: string;
  email?: string;
  password?: string;
  name?: string;
  cooperativaId?: string;
  cooperativaCnpj?: string;
};

/** Responsável define senha temporária de login do cooperado (cria ou atualiza app_users). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ProvisionLoginBody | null;
  const id = String(body?.id ?? "").trim();
  const cooperadoId = String(body?.cooperadoId ?? "").trim();
  const email = normalizeAuthEmail(String(body?.email ?? ""));
  const password = String(body?.password ?? "");
  const name = String(body?.name ?? "").trim();
  const cooperativaId = body?.cooperativaId ? String(body.cooperativaId) : undefined;
  const cooperativaCnpj = body?.cooperativaCnpj ? normalizeCnpj(String(body.cooperativaCnpj)) : "";

  if (!id || !cooperadoId || !email || !name || cooperativaCnpj.length !== 14) {
    return NextResponse.json({ error: "Dados incompletos para definir senha de acesso." }, { status: 400 });
  }
  if (!email.includes("@")) {
    return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "A senha deve ter no mínimo 6 caracteres." }, { status: 400 });
  }

  const guard = await guardCooperativaApi(request, cooperativaCnpj, {
    requireManagement: true,
    write: true,
  });
  if (!guard.ok) return guard.response;

  const supabase = getSupabaseAdmin()!;
  const emailTaken = await findAppUserByEmail(supabase, email);
  if (emailTaken && emailTaken.id !== id) {
    return NextResponse.json({ error: "Este e-mail já está cadastrado para outro usuário." }, { status: 409 });
  }

  const byCooperado = await findAppUserByCooperadoId(supabase, cooperadoId);
  if (byCooperado && byCooperado.id !== id) {
    return NextResponse.json(
      { error: "Este cooperado já possui conta de acesso com outro e-mail." },
      { status: 409 }
    );
  }

  const user = await upsertAppUserWithRoleRepair(supabase, {
    id,
    email,
    password,
    name,
    role: "cooperado",
    cooperativaId,
    cooperadoId,
    cooperativaCnpj,
    active: true,
  });

  if (!user) {
    return NextResponse.json({ error: "Não foi possível salvar o acesso na nuvem." }, { status: 503 });
  }

  await logSecurityEvent(supabase, {
    action: "cooperado.login_password_set",
    userId: guard.session?.sub,
    userEmail: guard.session?.email,
    cooperativaCnpj,
    ip: clientIp(request),
    metadata: {
      cooperadoId,
      memberId: user.id,
      memberEmail: user.email,
    },
  });

  return NextResponse.json({ ok: true, userId: user.id, email: user.email });
}
