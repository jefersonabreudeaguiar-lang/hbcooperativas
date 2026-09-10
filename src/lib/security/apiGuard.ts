import { NextResponse } from "next/server";
import { normalizeCnpj } from "@/utils/cooperativa";
import { isApiSecurityEnforced } from "@/lib/security/env";
import { extractAccessToken, verifyAccessToken, type SessionClaims } from "@/lib/security/jwt";
import { requireCooperativaSaasWritable } from "@/lib/security/saasGuard";
import { rateLimitApiDistributed } from "@/lib/security/rateLimit";
import { staffMfaDeniedResponse } from "@/lib/security/staffAccessPolicy";
import { recordCrossTenantBlocked } from "@/lib/security/platformSecurityEvents";
import { clientIp } from "@/lib/security/authRoutes";
import { canAccessPainelResponsavelSession } from "@/lib/security/responsavelPanelAccess";
import { isPlatformAdminSession } from "@/lib/security/appCreator";
import { requireSessionApiPermission } from "@/lib/security/serverPermissions";
import { canSessionManageEquipe } from "@/lib/security/staffProvisioningPolicy";

export type AuthResult =
  | { ok: true; session: SessionClaims | null; enforced: boolean }
  | { ok: false; response: NextResponse };

export async function requireApiAuth(request: Request): Promise<AuthResult> {
  if (!(await rateLimitApiDistributed(request))) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Muitas requisições. Aguarde um momento." }, { status: 429 }),
    };
  }

  if (!isApiSecurityEnforced()) {
    return { ok: true, session: null, enforced: false };
  }

  const token = extractAccessToken(request);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Autenticação necessária." }, { status: 401 }),
    };
  }

  const session = await verifyAccessToken(token);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 }),
    };
  }

  const mfaDenied = staffMfaDeniedResponse(session, true);
  if (mfaDenied) {
    return {
      ok: false,
      response: NextResponse.json({ error: mfaDenied.message, code: "MFA_REQUIRED" }, { status: 403 }),
    };
  }

  return { ok: true, session, enforced: true };
}

export function canAccessCooperativaCnpj(session: SessionClaims, cnpj: string): boolean {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return false;

  if (session.role === "admin") return true;

  const sessionCnpj = session.cooperativaCnpj ? normalizeCnpj(session.cooperativaCnpj) : "";
  if (sessionCnpj.length !== 14 || sessionCnpj !== digits) return false;

  return (
    session.role === "cooperado" ||
    session.role === "parceiro" ||
    session.role === "responsavel" ||
    session.role === "contador" ||
    session.role === "tesoureiro"
  );
}

export function requireCooperativaAccess(
  session: SessionClaims | null,
  cnpj: string,
  enforced: boolean,
  request?: Request
): NextResponse | null {
  if (!enforced || !session) return null;
  if (!canAccessCooperativaCnpj(session, cnpj)) {
    recordCrossTenantBlocked({
      session,
      requestedCnpj: cnpj,
      ip: request ? clientIp(request) : undefined,
      endpoint: request ? new URL(request.url).pathname : undefined,
    });
    return NextResponse.json({ error: "Sem permissão para esta cooperativa." }, { status: 403 });
  }
  return null;
}

export function requireStaffRole(
  session: SessionClaims | null,
  enforced: boolean
): NextResponse | null {
  if (!enforced || !session) return null;
  if (session.role === "cooperado" || session.role === "parceiro") {
    return NextResponse.json({ error: "Ação restrita à equipe da cooperativa." }, { status: 403 });
  }
  return null;
}

/** Apenas administrador global da plataforma HB (criador). */
export function requireAdminRole(
  session: SessionClaims | null,
  enforced: boolean
): NextResponse | null {
  if (!enforced || !session) return null;
  if (!isPlatformAdminSession(session)) {
    return NextResponse.json({ error: "Acesso restrito ao administrador da plataforma." }, { status: 403 });
  }
  return null;
}

/** Diretoria da cooperativa (responsável, tesoureiro ou admin global autorizado). */
export function requireManagementRole(
  session: SessionClaims | null,
  enforced: boolean
): NextResponse | null {
  if (!enforced || !session) return null;
  if (!canAccessPainelResponsavelSession(session)) {
    return NextResponse.json({ error: "Ação restrita à diretoria da cooperativa." }, { status: 403 });
  }
  return null;
}

/** Contador: somente leitura — bloqueia POST/PATCH/DELETE nas APIs cooperativas. */
export function requireNotContadorWrite(
  session: SessionClaims | null,
  enforced: boolean
): NextResponse | null {
  if (!enforced || !session) return null;
  if (session.role === "contador") {
    return NextResponse.json(
      { error: "Contador possui acesso somente leitura." },
      { status: 403 }
    );
  }
  return null;
}

export async function guardCooperativaApi(
  request: Request,
  cnpj: string,
  options?: { requireManagement?: boolean; write?: boolean; checkSaas?: boolean }
): Promise<
  | { ok: true; session: SessionClaims | null; enforced: boolean }
  | { ok: false; response: NextResponse }
> {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return { ok: false, response: auth.response };

  const denied = requireCooperativaAccess(auth.session, cnpj, auth.enforced, request);
  if (denied) return { ok: false, response: denied };

  if (options?.requireManagement) {
    const mgmt = requireManagementRole(auth.session, auth.enforced);
    if (mgmt) return { ok: false, response: mgmt };
  }

  if (options?.write) {
    const contadorDenied = requireNotContadorWrite(auth.session, auth.enforced);
    if (contadorDenied) return { ok: false, response: contadorDenied };

    const permDenied = requireSessionApiPermission(
      auth.session,
      new URL(request.url).pathname,
      request.method,
      auth.enforced
    );
    if (permDenied) return { ok: false, response: permDenied };
  }

  if (options?.checkSaas) {
    const saasDenied = await requireCooperativaSaasWritable(cnpj, auth.session, auth.enforced);
    if (saasDenied) return { ok: false, response: saasDenied };
  }

  return { ok: true, session: auth.session, enforced: auth.enforced };
}

export function requireEquipeManagementRole(
  session: SessionClaims | null,
  enforced: boolean
): NextResponse | null {
  if (!enforced || !session) return null;
  if (!canSessionManageEquipe(session)) {
    return NextResponse.json(
      { error: "Somente o responsável principal ou o tesoureiro pode gerenciar a equipe." },
      { status: 403 }
    );
  }
  return null;
}
