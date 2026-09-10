import type { SupabaseClient } from "@supabase/supabase-js";
import type { Action, ModoAcesso, Resource, UserRole } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";
import { normalizeAuthEmail } from "@/lib/security/appCreator";
import { hashPassword, verifyPassword } from "@/lib/security/password";
import { decryptSensitiveField, encryptSensitiveField } from "@/lib/security/fieldCrypto";

export type AppUserRow = {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: UserRole;
  cooperativa_id: string | null;
  cooperado_id: string | null;
  cooperativa_cnpj: string | null;
  active: boolean;
  funcao?: string | null;
  responsavel_principal?: boolean | null;
  modo_acesso?: ModoAcesso | null;
  permissoes_extras?: Partial<Record<Resource, Action[]>> | null;
  permissoes_negadas?: Partial<Record<Resource, Action[]>> | null;
  totp_secret_encrypted?: string | null;
  totp_enabled_at?: string | null;
};

export interface UpsertAppUserInput {
  id: string;
  email: string;
  password: string;
  name: string;
  role: UserRole;
  cooperativaId?: string;
  cooperadoId?: string;
  cooperativaCnpj?: string;
  funcao?: string;
  responsavelPrincipal?: boolean;
  modoAcesso?: ModoAcesso;
  permissoesExtras?: Partial<Record<Resource, Action[]>>;
  permissoesNegadas?: Partial<Record<Resource, Action[]>>;
  active?: boolean;
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || /app_users/i.test(error.message ?? "");
}

export async function isAppUsersTableReady(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.from("app_users").select("id").limit(1);
  return !error;
}

async function queryAppUserByEmailExact(
  supabase: SupabaseClient,
  email: string
): Promise<AppUserRow | null> {
  const { data, error } = await supabase
    .from("app_users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  return data as AppUserRow | null;
}

export async function findAppUserByEmail(
  supabase: SupabaseClient,
  email: string
): Promise<AppUserRow | null> {
  const simple = email.trim().toLowerCase();
  const canonical = normalizeAuthEmail(email);

  // Prioriza o e-mail digitado (ex.: alias +cooperado) antes de colapsar Gmail.
  const bySimple = await queryAppUserByEmailExact(supabase, simple);
  if (bySimple) return bySimple;

  if (canonical !== simple) {
    const byCanonical = await queryAppUserByEmailExact(supabase, canonical);
    if (byCanonical) return byCanonical;
  }

  return null;
}

function isRoleCheckViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "23514") return true;
  return /app_users_role_check|check constraint/i.test(error.message ?? "");
}

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || /column .* does not exist/i.test(error.message ?? "");
}

function buildAppUserRow(input: UpsertAppUserInput, password_hash: string) {
  return {
    ...buildLegacyAppUserRow(input, password_hash),
    funcao: input.funcao?.trim() || null,
    responsavel_principal: input.responsavelPrincipal ?? false,
    modo_acesso: input.modoAcesso ?? "total",
    permissoes_extras: input.permissoesExtras ?? null,
    permissoes_negadas: input.permissoesNegadas ?? null,
  };
}

function buildLegacyAppUserRow(input: UpsertAppUserInput, password_hash: string) {
  const email = normalizeAuthEmail(input.email);
  const cooperativa_cnpj = input.cooperativaCnpj ? normalizeCnpj(input.cooperativaCnpj) : null;
  return {
    id: input.id,
    email,
    password_hash,
    name: input.name.trim(),
    role: input.role,
    cooperativa_id: input.cooperativaId ?? null,
    cooperado_id: input.cooperadoId ?? null,
    cooperativa_cnpj: cooperativa_cnpj || null,
    active: input.active ?? true,
  };
}

export function appUserRowToSessionTokenInput(user: AppUserRow) {
  return {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    cooperativaId: user.cooperativa_id ?? undefined,
    cooperadoId: user.cooperado_id ?? undefined,
    cooperativaCnpj: user.cooperativa_cnpj ?? undefined,
    responsavelPrincipal: user.responsavel_principal === true,
    modoAcesso: user.modo_acesso ?? "total",
    permissoesExtras: user.permissoes_extras ?? undefined,
    permissoesNegadas: user.permissoes_negadas ?? undefined,
    funcao: user.funcao ?? undefined,
  };
}

export function appUserRowToAuthUser(user: AppUserRow) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    cooperativaId: user.cooperativa_id,
    cooperadoId: user.cooperado_id,
    cooperativaCnpj: user.cooperativa_cnpj,
    funcao: user.funcao,
    responsavelPrincipal: user.responsavel_principal === true,
    modoAcesso: user.modo_acesso ?? "total",
    permissoesExtras: user.permissoes_extras ?? undefined,
    permissoesNegadas: user.permissoes_negadas ?? undefined,
    active: user.active,
  };
}

export async function findAppUserByCooperadoId(
  supabase: SupabaseClient,
  cooperadoId: string
): Promise<AppUserRow | null> {
  const { data, error } = await supabase
    .from("app_users")
    .select("*")
    .eq("cooperado_id", cooperadoId)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  return data as AppUserRow | null;
}

export async function findAppUserById(
  supabase: SupabaseClient,
  userId: string
): Promise<AppUserRow | null> {
  const { data, error } = await supabase.from("app_users").select("*").eq("id", userId).maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  return data as AppUserRow | null;
}

export async function upsertAppUser(
  supabase: SupabaseClient,
  input: UpsertAppUserInput
): Promise<AppUserRow | null> {
  const keepPassword = input.password === "__keep__";
  let password_hash = keepPassword ? "" : await hashPassword(input.password);

  if (keepPassword) {
    const existing = await findAppUserById(supabase, input.id);
    if (!existing) return null;
    password_hash = existing.password_hash;
  }

  const row = buildAppUserRow(input, password_hash);

  let { data, error } = await supabase.from("app_users").upsert(row, { onConflict: "id" }).select().single();
  if (error && isMissingColumn(error)) {
    ({ data, error } = await supabase
      .from("app_users")
      .upsert(buildLegacyAppUserRow(input, password_hash), { onConflict: "id" })
      .select()
      .single());
  }

  if (error) {
    if (isMissingTable(error)) return null;
    if (isRoleCheckViolation(error)) {
      throw Object.assign(new Error("APP_USERS_ROLE_CHECK"), { cause: error });
    }
    throw error;
  }
  return data as AppUserRow;
}

/** Repara constraint de role (ex.: contador) e tenta upsert novamente. */
export async function upsertAppUserWithRoleRepair(
  supabase: SupabaseClient,
  input: UpsertAppUserInput
): Promise<AppUserRow | null> {
  try {
    return await upsertAppUser(supabase, input);
  } catch (e) {
    if (!(e instanceof Error && e.message === "APP_USERS_ROLE_CHECK")) throw e;
    const { applyAppUsersRoleConstraintSql } = await import("@/lib/supabase/appUsersSchema");
    const fixed = await applyAppUsersRoleConstraintSql();
    if (!fixed.ok) return null;
    return await upsertAppUser(supabase, input);
  }
}

export async function verifyAppUserPassword(
  supabase: SupabaseClient,
  email: string,
  password: string
): Promise<AppUserRow | null> {
  const user = await findAppUserByEmail(supabase, email);
  if (!user || !user.active) return null;
  const ok = await verifyPassword(password, user.password_hash);
  return ok ? user : null;
}

export async function updateAppUserPasswordHash(
  supabase: SupabaseClient,
  userId: string,
  password: string
): Promise<void> {
  const password_hash = await hashPassword(password);
  const { error } = await supabase.from("app_users").update({ password_hash }).eq("id", userId);
  if (error && !isMissingTable(error)) throw error;
}

export async function updateAppUserProfile(
  supabase: SupabaseClient,
  userId: string,
  patch: Omit<UpsertAppUserInput, "id" | "email" | "password"> & { password?: string }
): Promise<AppUserRow | null> {
  const existing = await findAppUserById(supabase, userId);
  if (!existing) return null;

  return upsertAppUser(supabase, {
    id: existing.id,
    email: existing.email,
    password: patch.password && patch.password.length >= 6 ? patch.password : "__keep__",
    name: patch.name ?? existing.name,
    role: patch.role ?? existing.role,
    cooperativaId: patch.cooperativaId ?? existing.cooperativa_id ?? undefined,
    cooperadoId: patch.cooperadoId ?? existing.cooperado_id ?? undefined,
    cooperativaCnpj: patch.cooperativaCnpj ?? existing.cooperativa_cnpj ?? undefined,
    funcao: patch.funcao ?? existing.funcao ?? undefined,
    responsavelPrincipal: patch.responsavelPrincipal ?? existing.responsavel_principal === true,
    modoAcesso: patch.modoAcesso ?? existing.modo_acesso ?? "total",
    permissoesExtras: patch.permissoesExtras ?? existing.permissoes_extras ?? undefined,
    permissoesNegadas: patch.permissoesNegadas ?? existing.permissoes_negadas ?? undefined,
    active: patch.active ?? existing.active,
  });
}

export async function logSecurityEvent(
  supabase: SupabaseClient,
  event: {
    action: string;
    userId?: string;
    userEmail?: string;
    cooperativaCnpj?: string;
    ip?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await supabase.from("security_audit_log").insert({
    action: event.action,
    user_id: event.userId ?? null,
    user_email: event.userEmail ?? null,
    cooperativa_cnpj: event.cooperativaCnpj ? normalizeCnpj(event.cooperativaCnpj) : null,
    ip: event.ip ?? null,
    metadata: event.metadata ?? null,
  });
  if (error && !/security_audit_log/i.test(error.message ?? "")) {
    console.error("[security-audit]", error.message);
  }
}

/** Senha de cadastro de cooperado — armazenada como hash na nuvem. */
export function protectSenhaCadastroForCloud(senha?: string): string | undefined {
  const trimmed = senha?.trim();
  if (!trimmed) return undefined;
  return encryptSensitiveField(trimmed);
}

export function readSenhaCadastroFromCloud(stored?: string): string | undefined {
  if (!stored?.trim()) return undefined;
  return decryptSensitiveField(stored.trim()) || undefined;
}
