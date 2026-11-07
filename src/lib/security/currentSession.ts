import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionClaims } from "./jwt";
import { appUserRowToSessionTokenInput, type AppUserRow } from "@/lib/supabase/usersAuth";
import { normalizeCnpj } from "@/utils/cooperativa";

export type CurrentSessionResult =
  | { ok: true; session: SessionClaims; user: AppUserRow }
  | { ok: false; status: 401 | 503 };

/** A signed cookie is not evidence that its account or permissions are still active. */
export async function resolveCurrentSession(
  supabase: SupabaseClient | null,
  claims: SessionClaims,
): Promise<CurrentSessionResult> {
  if (!supabase) return { ok: false, status: 503 };
  try {
    // Do not load password hashes or TOTP secrets for authorization checks.
    const { data, error } = await supabase.from("app_users")
      .select("id,email,name,role,cooperativa_id,cooperado_id,cooperativa_cnpj,active,funcao,responsavel_principal,modo_acesso,permissoes_extras,permissoes_negadas")
      .eq("id", claims.sub).maybeSingle();
    if (error) return { ok: false, status: 503 };
    if (!data || data.active !== true) return { ok: false, status: 401 };
    const user = data as AppUserRow;
    const role = user.role === "parceiro" || user.role === "contador"
      ? user.role : user.cooperado_id?.trim() ? "cooperado" : user.role;
    // Rebinding an identity requires a new login, never silent access to its new tenant.
    if (role !== claims.role ||
        normalizeCnpj(user.cooperativa_cnpj ?? "") !== normalizeCnpj(claims.cooperativaCnpj ?? "") ||
        (user.cooperativa_id ?? "") !== (claims.cooperativaId ?? "") ||
        (user.cooperado_id ?? "") !== (claims.cooperadoId ?? "") ||
        user.email !== claims.email) return { ok: false, status: 401 };
    return { ok: true, user, session: {
      ...claims,
      ...appUserRowToSessionTokenInput(user),
      role,
      // MFA is not available in the current application.
      mfaVerified: false,
    } };
  } catch {
    // Infrastructure failure must never recreate access from cached claims.
    return { ok: false, status: 503 };
  }
}
