import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/security/apiGuard";
import { resolveBicD1EligibilityHttp } from "@/lib/security/bicD1DiagnosticAccess";

/**
 * BIC-D1 — barreira de elegibilidade (read-only).
 * Ignora query/body; cooperadoId e CNPJ vêm apenas do JWT validado.
 */
export async function GET(request: Request) {
  const gate = await requireApiAuth(request);
  if (!gate.ok) {
    return NextResponse.json({ allowed: false }, { status: 401 });
  }

  const { status, body } = resolveBicD1EligibilityHttp(gate.session, gate.enforced);
  return NextResponse.json(body, { status });
}
