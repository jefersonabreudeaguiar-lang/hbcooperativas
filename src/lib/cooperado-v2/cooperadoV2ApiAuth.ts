import { NextResponse } from "next/server";
import { normalizeCnpj } from "@/utils/cooperativa";
import { requireApiAuth, requireCooperativaAccess } from "@/lib/security/apiGuard";
import type { SessionClaims } from "@/lib/security/jwt";
import { COOPERADO_V2_PILOT_COOPERADO_ID } from "@/lib/cooperado-v2/cooperadoV2Pilot";

export type CooperadoV2ApiContext = {
  session: SessionClaims;
  cnpj: string;
  cooperadoId: string;
};

export async function requireCooperadoV2Api(
  request: Request
): Promise<{ ok: true; ctx: CooperadoV2ApiContext } | { ok: false; response: NextResponse }> {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth;

  const { session, enforced } = auth;
  if (enforced && session) {
    if (session.role !== "cooperado") {
      return {
        ok: false,
        response: NextResponse.json({ error: "Apenas cooperado no piloto v2." }, { status: 403 }),
      };
    }
    const cooperadoId = (session.cooperadoId ?? "").trim();
    if (cooperadoId !== COOPERADO_V2_PILOT_COOPERADO_ID) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Piloto v2 restrito a homologação." }, { status: 403 }),
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

  // Dev sem enforcement: exige query explícita (somente local).
  const { searchParams } = new URL(request.url);
  const cnpj = normalizeCnpj(searchParams.get("cnpj") ?? "");
  const cooperadoId = (searchParams.get("cooperadoId") ?? "").trim();
  if (cnpj.length !== 14 || cooperadoId !== COOPERADO_V2_PILOT_COOPERADO_ID) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Piloto v2: credenciais de homologação." }, { status: 403 }),
    };
  }
  return {
    ok: true,
    ctx: {
      session: {
        sub: "dev",
        email: "dev@local",
        name: "Dev",
        role: "cooperado",
        cooperadoId,
        cooperativaCnpj: cnpj,
      },
      cnpj,
      cooperadoId,
    },
  };
}
