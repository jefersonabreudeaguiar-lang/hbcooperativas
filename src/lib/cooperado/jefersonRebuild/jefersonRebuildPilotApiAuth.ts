import { NextResponse } from "next/server";
import { normalizeCnpj } from "@/utils/cooperativa";
import { requireApiAuth, requireCooperativaAccess } from "@/lib/security/apiGuard";
import type { SessionClaims } from "@/lib/security/jwt";
import { COOPERADO_MOBILE_PILOT_COOPERADO_ID } from "@/lib/cooperado/cooperadoMobilePilot";

export type JefersonRebuildApiContext = {
  session: SessionClaims;
  cnpj: string;
  cooperadoId: string;
};

export async function requireJefersonRebuildPilotApi(
  request: Request
): Promise<{ ok: true; ctx: JefersonRebuildApiContext } | { ok: false; response: NextResponse }> {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth;

  const { session, enforced } = auth;
  if (!enforced || !session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "API piloto rebuild — autenticação obrigatória." }, { status: 403 }),
    };
  }

  if (session.role !== "cooperado") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Apenas cooperado no piloto rebuild." }, { status: 403 }),
    };
  }

  const cooperadoId = (session.cooperadoId ?? "").trim();
  if (cooperadoId !== COOPERADO_MOBILE_PILOT_COOPERADO_ID) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Piloto rebuild restrito a homologação Jeferson." }, { status: 403 }),
    };
  }

  const cnpj = normalizeCnpj(session.cooperativaCnpj ?? "");
  if (cnpj.length !== 14) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Cooperativa inválida na sessão." }, { status: 400 }),
    };
  }

  const denied = requireCooperativaAccess(session, cnpj, enforced, request);
  if (denied) return { ok: false, response: denied };

  return { ok: true, ctx: { session, cnpj, cooperadoId } };
}
