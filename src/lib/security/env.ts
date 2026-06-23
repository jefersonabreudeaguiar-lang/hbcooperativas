import { isSupabaseConfigured } from "@/lib/supabase/admin";

const DEV_AUTH_SECRET = "dev-only-change-in-production-hb-cooperativas";

export function getAuthSecret(): string {
  return process.env.AUTH_SECRET?.trim() || DEV_AUTH_SECRET;
}

/** Segurança de API ativa quando nuvem + segredo configurados (produção). */
export function isApiSecurityEnforced(): boolean {
  if (!isSupabaseConfigured()) return false;
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production") return true;
    return false;
  }
  return true;
}

export function getFieldEncryptionKey(): string | null {
  const key = process.env.FIELD_ENCRYPTION_KEY?.trim();
  return key && key.length >= 32 ? key : null;
}
