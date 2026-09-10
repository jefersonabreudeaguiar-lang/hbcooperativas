import { NextResponse } from "next/server";
import { requireAdminRole, requireApiAuth } from "@/lib/security/apiGuard";
import { buildHobeliscoAdminOverview } from "@/lib/lab/hobeliscoAdminOverview";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;
  const adminDenied = requireAdminRole(auth.session, auth.enforced);
  if (adminDenied) return adminDenied;

  const overview = await buildHobeliscoAdminOverview();
  return NextResponse.json(overview);
}
