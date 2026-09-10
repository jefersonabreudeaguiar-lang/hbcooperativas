import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptSensitiveField, decryptSensitiveField } from "@/lib/security/fieldCrypto";
import { generateTotpSecret, verifyTotpCode, buildTotpUri } from "@/lib/security/staffTotp";
import { isAppUsersMfaReady } from "@/lib/supabase/appUsersMfaSchema";

type UserMfaRow = {
  id: string;
  email: string;
  role: string;
  totp_secret_encrypted?: string | null;
  totp_enabled_at?: string | null;
};

export async function getUserMfaRow(
  supabase: SupabaseClient,
  userId: string
): Promise<UserMfaRow | null> {
  if (!(await isAppUsersMfaReady(supabase))) return null;
  const { data, error } = await supabase
    .from("app_users")
    .select("id, email, role, totp_secret_encrypted, totp_enabled_at")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as UserMfaRow;
}

export function decryptTotpSecret(stored: string | null | undefined): string | null {
  if (!stored?.trim()) return null;
  const plain = decryptSensitiveField(stored.trim());
  return plain || null;
}

export async function beginTotpSetup(
  supabase: SupabaseClient,
  userId: string
): Promise<{ secret: string; uri: string; email: string } | null> {
  const row = await getUserMfaRow(supabase, userId);
  if (!row) return null;
  const secret = generateTotpSecret();
  const encrypted = encryptSensitiveField(secret);
  const { error } = await supabase
    .from("app_users")
    .update({ totp_secret_encrypted: encrypted, totp_enabled_at: null })
    .eq("id", userId);
  if (error) return null;
  return { secret, uri: buildTotpUri(secret, row.email), email: row.email };
}

export async function confirmTotpSetup(
  supabase: SupabaseClient,
  userId: string,
  code: string
): Promise<boolean> {
  const row = await getUserMfaRow(supabase, userId);
  if (!row) return false;
  const secret = decryptTotpSecret(row.totp_secret_encrypted);
  if (!secret || !verifyTotpCode(secret, code)) return false;
  const { error } = await supabase
    .from("app_users")
    .update({ totp_enabled_at: new Date().toISOString() })
    .eq("id", userId);
  return !error;
}

export async function verifyUserTotpCode(
  supabase: SupabaseClient,
  userId: string,
  code: string
): Promise<boolean> {
  const row = await getUserMfaRow(supabase, userId);
  if (!row?.totp_enabled_at) return false;
  const secret = decryptTotpSecret(row.totp_secret_encrypted);
  if (!secret) return false;
  return verifyTotpCode(secret, code);
}

export function userRowHasTotpEnabled(row: UserMfaRow | null): boolean {
  return Boolean(row?.totp_enabled_at);
}
