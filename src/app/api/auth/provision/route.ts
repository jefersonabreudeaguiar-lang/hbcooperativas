import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  clientIp,
  ensureAuthInfrastructure,
  tokenResponseForUser,
} from "@/lib/security/authRoutes";
import { findAppUserByEmail, logSecurityEvent, upsertAppUser, verifyAppUserPassword } from "@/lib/supabase/usersAuth";
import type { UserRole } from "@/types";

const VALID_ROLES: UserRole[] = ["admin", "tesoureiro", "responsavel", "cooperado"];

/** Sincroniza usuário local existente para a nuvem na primeira sessão segura. */
export async function POST(request: Request) {
  const blocked = ensureAuthInfrastructure(request);
  if (blocked) return blocked;

  const body = await request.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  const id = String(body?.id ?? "").trim();
  const name = String(body?.name ?? "").trim();
  const role = String(body?.role ?? "") as UserRole;

  if (!email || !password || !id || !name || !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin()!;
  const existing = await findAppUserByEmail(supabase, email);

  if (existing) {
    const verified = await verifyAppUserPassword(supabase, email, password);
    if (!verified) {
      return NextResponse.json({ error: "Credenciais inválidas." }, { status: 401 });
    }
    return tokenResponseForUser(verified);
  }

  const user = await upsertAppUser(supabase, {
    id,
    email,
    password,
    name,
    role,
    cooperativaId: body?.cooperativaId ? String(body.cooperativaId) : undefined,
    cooperadoId: body?.cooperadoId ? String(body.cooperadoId) : undefined,
    cooperativaCnpj: body?.cooperativaCnpj ? String(body.cooperativaCnpj) : undefined,
  });

  if (!user) {
    return NextResponse.json({ error: "Tabela de usuários não configurada." }, { status: 503 });
  }

  await logSecurityEvent(supabase, {
    action: "auth.provision",
    userId: user.id,
    userEmail: user.email,
    cooperativaCnpj: user.cooperativa_cnpj ?? undefined,
    ip: clientIp(request),
  });

  return tokenResponseForUser(user);
}
