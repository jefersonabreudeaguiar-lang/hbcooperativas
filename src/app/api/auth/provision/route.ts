import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeCnpj } from "@/utils/cooperativa";
import {
  clientIp,
  ensureAuthInfrastructure,
  tokenResponseForUser,
} from "@/lib/security/authRoutes";
import { isProvisionNewUserRole } from "@/lib/security/authPolicy";
import {
  findAppUserByEmail,
  logSecurityEvent,
  updateAppUserPasswordHash,
  upsertAppUserWithRoleRepair,
  verifyAppUserPassword,
} from "@/lib/supabase/usersAuth";
import type { UserRole } from "@/types";

const VALID_ROLES: UserRole[] = ["admin", "tesoureiro", "responsavel", "cooperado", "contador"];

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
  const requestCnpj = body?.cooperativaCnpj ? normalizeCnpj(String(body.cooperativaCnpj)) : "";

  const profilePayload = {
    id,
    email,
    password,
    name,
    role,
    cooperativaId: body?.cooperativaId ? String(body.cooperativaId) : undefined,
    cooperadoId: body?.cooperadoId ? String(body.cooperadoId) : undefined,
    cooperativaCnpj: requestCnpj.length === 14 ? requestCnpj : undefined,
  };

  if (existing) {
    const verified = await verifyAppUserPassword(supabase, email, password);
    if (verified) {
      const synced = await upsertAppUserWithRoleRepair(supabase, {
        ...profilePayload,
        id: verified.id,
        name: name || verified.name,
      });
      return tokenResponseForUser(synced ?? verified);
    }
    if (existing.id === id) {
      await updateAppUserPasswordHash(supabase, id, password);
      const synced = await upsertAppUserWithRoleRepair(supabase, profilePayload);
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
    const existingCnpj = existing.cooperativa_cnpj ? normalizeCnpj(existing.cooperativa_cnpj) : "";
    if (requestCnpj.length === 14 && existingCnpj.length === 14 && requestCnpj === existingCnpj) {
      await updateAppUserPasswordHash(supabase, existing.id, password);
      const synced = await upsertAppUserWithRoleRepair(supabase, {
        ...profilePayload,
        id: existing.id,
      });
      if (synced) {
        await logSecurityEvent(supabase, {
          action: "auth.provision.resync_cnpj",
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

  if (!isProvisionNewUserRole(role)) {
    return NextResponse.json({ error: "Perfil não permitido na sincronização." }, { status: 403 });
  }

  const user = await upsertAppUserWithRoleRepair(supabase, profilePayload);

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
