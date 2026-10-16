import { NextResponse } from "next/server";
import { buildBicParidadeHealthSnapshot } from "@/lib/bic/bicParidadeHealth";
import { requireApiAuth, requireStaffRole } from "@/lib/security/apiGuard";

export const dynamic = "force-dynamic";

/** Staff — saúde BIC / Concerto (sem dados operacionais). */
export async function GET(request: Request) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;
  const staffDenied = requireStaffRole(auth.session, auth.enforced);
  if (staffDenied) return staffDenied;

  const clientTelemetryHeader = request.headers.get("x-hb-bic-telemetry");
  let clientTelemetry: unknown = null;
  if (clientTelemetryHeader) {
    try {
      clientTelemetry = JSON.parse(clientTelemetryHeader);
    } catch {
      clientTelemetry = { parseError: true };
    }
  }

  return NextResponse.json({
    ok: true,
    ...buildBicParidadeHealthSnapshot(),
    clientTelemetry,
  });
}
