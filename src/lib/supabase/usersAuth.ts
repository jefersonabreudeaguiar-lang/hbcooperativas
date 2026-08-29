import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";
import { hashPassword, verifyPassword } from "@/lib/security/password";
import { encryptSensitiveField } from "@/lib/security/fieldCrypto";

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
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || /app_users/i.test(error.message ?? "");
}

export async function isAppUsersTableReady(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.from("app_users").select("id", { head: true, count: "exact" });
  return !error;
}

export async function findAppUserByEmail(
  supabase: SupabaseClient,
  email: string
): Promise<AppUserRow | null> {
  const { data, error } = await supabase
    .from("app_users")
    .select("*")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();

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
  const email = input.email.trim().toLowerCase();
  const password_hash = await hashPassword(input.password);
  const cooperativa_cnpj = input.cooperativaCnpj ? normalizeCnpj(input.cooperativaCnpj) : null;

  const row = {
    id: input.id,
    email,
    password_hash,
    name: input.name.trim(),
    role: input.role,
    cooperativa_id: input.cooperativaId ?? null,
    cooperado_id: input.cooperadoId ?? null,
    cooperativa_cnpj: cooperativa_cnpj || null,
    active: true,
  };

  const { data, error } = await supabase.from("app_users").upsert(row, { onConflict: "id" }).select().single();
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  return data as AppUserRow;
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
  return stored;
}
