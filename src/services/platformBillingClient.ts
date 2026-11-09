import { secureApiFetch } from '@/lib/security/clientSession';
import type { CobrancaSaasCooperativa } from '@/types';
import type { CobrancaSaasAdminRow, CobrancaSaasPricing } from '@/services/cobrancaSaasService';
export type PlatformBillingOverview = { rows: CobrancaSaasAdminRow[]; pricing: CobrancaSaasPricing; generatedAt: string };
export const PLATFORM_BILLING_CHANGED = 'hb-platform-billing-changed';
export async function fetchPlatformBillingOverview(): Promise<PlatformBillingOverview> {
  const r = await secureApiFetch('/api/admin/cobranca-overview', { cache: 'no-store' });
  const json = await r.json();
  if (!r.ok || !Array.isArray(json.rows) || !json.pricing) throw new Error(json.error ?? 'Cobrança da nuvem indisponível.');
  return json;
}
export async function requestBillingAction(cnpj: string, action: string, periodoId?: string, motivo?: string): Promise<CobrancaSaasCooperativa> {
  const r = await secureApiFetch('/api/cobranca-saas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cnpj, action, periodoId, motivo }) });
  const json = await r.json();
  if (!r.ok || !json.ok || !json.cobrancaSaas) throw new Error(json.error ?? 'Cobrança não confirmada na nuvem.');
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PLATFORM_BILLING_CHANGED));
  return json.cobrancaSaas;
}
