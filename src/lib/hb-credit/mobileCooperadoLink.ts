import type { UserRole } from "@/types";
import { normalizeAuthEmail } from "@/lib/security/appCreator";

/** Vínculos fixos: e-mail de gestão no celular → cooperado (ex.: Orlando). */
const MOBILE_COOPERADO_BY_EMAIL: Record<string, string> = {
  [normalizeAuthEmail("jefersonabreudeaguiar@gmail.com")]: "c_1782263929381_ncp55",
};

export function resolveMobileCooperadoIdFromEmail(email: string | null | undefined): string | undefined {
  if (!email?.trim()) return undefined;
  return MOBILE_COOPERADO_BY_EMAIL[normalizeAuthEmail(email)];
}

export function resolveMobileCooperadoId(profile: {
  email?: string | null;
  mobileCooperadoId?: string | null;
}): string | undefined {
  const fromProfile = profile.mobileCooperadoId?.trim();
  if (fromProfile) return fromProfile;
  return resolveMobileCooperadoIdFromEmail(profile.email);
}

/** Detecta app mobile/PWA pelo User-Agent (server-side). */
export function isMobileCooperativaUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
}

type CooperadoSession = {
  role: UserRole;
  email: string;
  cooperadoId?: string;
};

/** Cooperado autenticado ou responsável no celular com vínculo fixo (voto, pagamento, etc.). */
export function resolveAuthorizedCooperadoId(
  session: CooperadoSession | null,
  request: Request,
  clientCooperadoId: string,
  enforced: boolean
): { ok: true; cooperadoId: string } | { ok: false; error: string } {
  if (!enforced || !session) {
    return { ok: true, cooperadoId: clientCooperadoId };
  }

  if (session.role === "cooperado") {
    if (!session.cooperadoId || session.cooperadoId !== clientCooperadoId) {
      return { ok: false, error: "Voto deve ser do cooperado autenticado." };
    }
    return { ok: true, cooperadoId: clientCooperadoId };
  }

  if (session.role === "parceiro") {
    return { ok: false, error: "Ação restrita ao cooperado." };
  }

  const staffRole =
    session.role === "responsavel" || session.role === "tesoureiro" || session.role === "admin";

  if (staffRole) {
    const mapped = resolveMobileCooperadoIdFromEmail(session.email);
    const ua = request.headers.get("user-agent");
    if (mapped && isMobileCooperativaUserAgent(ua)) {
      if (clientCooperadoId !== mapped) {
        return { ok: false, error: "Cooperado não autorizado neste dispositivo." };
      }
      return { ok: true, cooperadoId: mapped };
    }
    return { ok: false, error: "Apenas cooperados registram voto por este canal." };
  }

  return { ok: false, error: "Sem permissão." };
}
