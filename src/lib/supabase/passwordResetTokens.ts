import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const TOKEN_TTL_MS = 60 * 60 * 1000;

export function generatePasswordResetToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export async function createPasswordResetToken(
  supabase: SupabaseClient,
  userId: string,
  ip?: string
): Promise<string> {
  const now = new Date().toISOString();
  await supabase
    .from("password_reset_tokens")
    .update({ used_at: now })
    .eq("user_id", userId)
    .is("used_at", null);

  const token = generatePasswordResetToken();
  const token_hash = hashPasswordResetToken(token);
  const expires_at = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  const { error } = await supabase.from("password_reset_tokens").insert({
    user_id: userId,
    token_hash,
    expires_at,
    ip: ip ?? null,
  });
  if (error) throw error;
  return token;
}

export async function validatePasswordResetToken(
  supabase: SupabaseClient,
  token: string
): Promise<{ userId: string; tokenId: string } | null> {
  const token_hash = hashPasswordResetToken(token);
  const { data, error } = await supabase
    .from("password_reset_tokens")
    .select("id, user_id, expires_at, used_at")
    .eq("token_hash", token_hash)
    .maybeSingle();

  if (error || !data) return null;
  if (data.used_at) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return { userId: data.user_id, tokenId: data.id };
}

export async function consumePasswordResetToken(
  supabase: SupabaseClient,
  token: string
): Promise<{ userId: string } | null> {
  const valid = await validatePasswordResetToken(supabase, token);
  if (!valid) return null;

  const now = new Date().toISOString();
  await supabase.from("password_reset_tokens").update({ used_at: now }).eq("id", valid.tokenId);
  await supabase
    .from("password_reset_tokens")
    .update({ used_at: now })
    .eq("user_id", valid.userId)
    .is("used_at", null);

  return { userId: valid.userId };
}
