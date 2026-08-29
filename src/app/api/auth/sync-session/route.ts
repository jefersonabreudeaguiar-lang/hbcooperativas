import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  clientIp,
  ensureAuthInfrastructure,
  tokenResponseForUser,
} from "@/lib/security/authRoutes";
import {
  findAppUserByEmail,
  isAppUsersTableReady,
  logSecurityEvent,
  updateAppUserPasswordHash,
  upsertAppUser,
  verifyAppUserPassword,
} from "@/lib/supabase/usersAuth";
import { applyAppUsersSchemaSql } from "@/lib/supabase/appUsersSchema";
import { normalizeCnpj } from "@/utils/cooperativa";
import type { UserRole } from "@/types";

const VALID_ROLES: UserRole[] = ["admin", "tesoureiro", "responsavel", "cooperado", "parceiro"];

/**
 * Unifica login + provision + register em uma única chamada.
 * Usado pelo app após login local para garantir JWT antes da Conta Coop.
 */
export async function POST(request: Request) {
  const blocked = ensureAuthInfrastructure(request);
  if (blocked) return blocked;

  const body = await request.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  const id = String(body?.id ?? "").trim();
  const name = String(body?.name ?? "").trim();
  const role = String(body?.role ?? "") as UserRole;
  const requestCnpj = body?.cooperativaCnpj ? normalizeCnpj(String(body.cooperativaCnpj)) : "";

  if (!email || !password || password.length < 6) {
    return NextResponse.json({ error: "E-mail e senha são obrigatórios.", code: "INVALID_INPUT" }, { status: 400 });
  }
  if (!id || !name || !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Perfil inválido para sincronização.", code: "INVALID_PROFILE" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin()!;
  if (!(await isAppUsersTableReady(supabase))) {
    const autoApply = await applyAppUsersSchemaSql();
    if (!autoApply.ok || !(await isAppUsersTableReady(supabase))) {
      return NextResponse.json(
        {
          error: "Tabela app_users não existe no Supabase. Execute a migration APPLY_APP_USERS.sql.",
          code: "APP_USERS_MISSING",
        },
        { status: 503 }
      );
    }
  }

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

  const existing = await findAppUserByEmail(supabase, email);

  if (existing) {
    let user = await verifyAppUserPassword(supabase, email, password);
    if (user) {
      const synced = await upsertAppUser(supabase, {
        ...profilePayload,
        id: user.id,
        name: name || user.name,
      });
      user = synced ?? user;
    } else if (existing.id === id) {
      await updateAppUserPasswordHash(supabase, id, password);
      const synced = await upsertAppUser(supabase, profilePayload);
      user = synced;
    } else {
      const existingCnpj = existing.cooperativa_cnpj ? normalizeCnpj(existing.cooperativa_cnpj) : "";
      const cnpjOk =
        requestCnpj.length === 14 &&
        (existingCnpj.length === 14 ? requestCnpj === existingCnpj : true);
      if (cnpjOk) {
        await updateAppUserPasswordHash(supabase, existing.id, password);
        const synced = await upsertAppUser(supabase, {
          ...profilePayload,
          id: existing.id,
        });
        user = synced;
      }
    }

    if (user) {
      await logSecurityEvent(supabase, {
        action: "auth.sync_session",
        userId: user.id,
        userEmail: user.email,
        cooperativaCnpj: user.cooperativa_cnpj ?? undefined,
        ip: clientIp(request),
      });
      return tokenResponseForUser(user);
    }

    return NextResponse.json(
      { error: "Não foi possível sincronizar sua conta na nuvem.", code: "SYNC_DENIED" },
      { status: 401 }
    );
  }

  const created = await upsertAppUser(supabase, profilePayload);
  if (!created) {
    return NextResponse.json(
      {
        error: "Tabela app_users não existe no Supabase. Execute a migration app_users_security.",
        code: "APP_USERS_MISSING",
      },
      { status: 503 }
    );
  }

  await logSecurityEvent(supabase, {
    action: "auth.sync_session.create",
    userId: created.id,
    userEmail: created.email,
    cooperativaCnpj: created.cooperativa_cnpj ?? undefined,
    ip: clientIp(request),
  });

  return tokenResponseForUser(created);
}
