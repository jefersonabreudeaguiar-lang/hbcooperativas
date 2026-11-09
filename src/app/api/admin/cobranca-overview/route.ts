import { NextResponse } from 'next/server';
import { requireApiAuth, requireAdminRole } from '@/lib/security/apiGuard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { fetchCobrancaSaasPlatformSettings } from '@/lib/supabase/platformSettingsStorage';
import { readPlatformBilling } from '@/lib/billing/platformBillingRead';
export const maxDuration = 60;
export async function GET(request: Request) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;
  const denied = requireAdminRole(auth.session, auth.enforced);
  if (denied) return denied;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'Nuvem indisponível.' }, { status: 503 });
  try {
    const pricing = await fetchCobrancaSaasPlatformSettings(sb, true);
    const rows = await readPlatformBilling(sb, pricing);
    return NextResponse.json({ pricing, rows, generatedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'Não foi possível conferir a cobrança completa na nuvem.' }, { status: 503 }); }
}
