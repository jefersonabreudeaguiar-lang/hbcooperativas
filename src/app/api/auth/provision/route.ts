import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  clientIp,
  ensureAuthInfrastructure,
  tokenResponseForUser,
} from "@/lib/security/authRoutes";
import {
  findAppUserByEmail,
  logSecurityEvent,
  updateAppUserPasswordHash,
  upsertAppUser,
  verifyAppUserPassword,
} from "@/lib/supabase/usersAuth";
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

  const profilePayload = {
    id,
    email,
    password,
    name,
    role,
    cooperativaId: body?.cooperativaId ? String(body.cooperativaId) : undefined,
    cooperadoId: body?.cooperadoId ? String(body.cooperadoId) : undefined,
    cooperativaCnpj: body?.cooperativaCnpj ? String(body.cooperativaCnpj) : undefined,
  };

  if (existing) {
    const verified = await verifyAppUserPassword(supabase, email, password);
    if (verified) {
      const synced = await upsertAppUser(supabase, {
        ...profilePayload,
        id: verified.id,
        name: name || verified.name,
      });
      return tokenResponseForUser(synced ?? verified);
    }
    if (existing.id === id) {
      await updateAppUserPasswordHash(supabase, id, password);
      const synced = await upsertAppUser(supabase, profilePayload);
      if (synced) {
        await logSecurityEvent(supabase, {
          action: "auth.provision.resync",
          userId: synced.id,
          userEmail: synced.email,
          cooperativaCnpj: synced.cooperativa_cnpj ?? undefined,
          ip: clientIp(request),
        });
        return tokenResponseForUser(synced);
      }
    }
    return NextResponse.json({ error: "Credenciais inválidas." }, { status: 401 });
  }

  const user = await upsertAppUser(supabase, profilePayload);

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
