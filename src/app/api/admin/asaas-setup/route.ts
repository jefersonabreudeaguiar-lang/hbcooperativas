import { NextResponse } from "next/server";
import { requireAdminRole, requireApiAuth } from "@/lib/security/apiGuard";
import { getAsaasConfig, getAsaasKeyDiagnostics, getAsaasSetupInfo } from "@/lib/asaas/config";
import { probeAsaasApiConnection } from "@/lib/asaas/client";

export async function GET(request: Request) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;
  const adminDenied = requireAdminRole(auth.session, auth.enforced);
  if (adminDenied) return adminDenied;

  const setup = getAsaasSetupInfo();
  const probe = new URL(request.url).searchParams.get("probe") === "1";
  if (!probe) {
    return NextResponse.json({ ok: true, setup });
  }

  const config = getAsaasConfig();
  const keyDiagnostics = getAsaasKeyDiagnostics(config);
  if (!config) {
    return NextResponse.json({
      ok: true,
      setup,
      keyDiagnostics,
      apiProbe: { ok: false, status: 0, error: "ASAAS_API_KEY não definida no servidor." },
    });
  }

  const apiProbe = await probeAsaasApiConnection(config);
  return NextResponse.json({
    ok: true,
    setup,
    keyDiagnostics,
    apiProbe,
  });
}
