import { NextResponse } from "next/server";
import { requireAdminRole, requireApiAuth } from "@/lib/security/apiGuard";
import { getAsaasConfig, getAsaasSetupInfo } from "@/lib/asaas/config";
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
  if (!config) {
    return NextResponse.json({
      ok: true,
      setup,
      apiProbe: { ok: false, status: 0, error: "ASAAS_API_KEY não definida no servidor." },
    });
  }

  const apiProbe = await probeAsaasApiConnection(config);
  return NextResponse.json({
    ok: true,
    setup,
    apiProbe: apiProbe.ok
      ? { ok: true as const }
      : { ok: false as const, status: apiProbe.status, error: apiProbe.error },
  });
}
