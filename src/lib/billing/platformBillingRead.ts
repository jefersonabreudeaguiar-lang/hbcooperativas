import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppData, Cooperado, Cooperativa, CobrancaSaasCooperativa } from '@/types';
import { emptyInitialData } from '@/mock/data';
import { applyCobrancaSaasPricingToData, listarCobrancasSaasAdmin, type CobrancaSaasPricing } from '@/services/cobrancaSaasService';
import { normalizeCnpj } from '@/utils/cooperativa';

/** Complete, read-only, bounded-concurrency reads. A failed file never becomes zero billable members. */
export async function readBillingMembers(sb: SupabaseClient, cnpj: string): Promise<Cooperado[]> {
  const names: string[] = [];
  for (let offset = 0; ; offset += 500) {
    const r = await sb.storage.from('hb-cooperados').list(cnpj, { limit: 500, offset });
    if (r.error || !Array.isArray(r.data)) throw new Error('Não foi possível conferir todos os cooperados da cobrança.');
    names.push(...r.data.filter(f => f.name.endsWith('.json')).map(f => f.name));
    if (r.data.length < 500) break;
  }
  let cursor = 0;
  const members: Cooperado[] = [];
  await Promise.all(Array.from({ length: Math.min(8, names.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= names.length) return;
      const r = await sb.storage.from('hb-cooperados').download(`${cnpj}/${names[index]}`, { cacheNonce: crypto.randomUUID() }, { cache: 'no-store' });
      if (r.error || !r.data) throw new Error('Cadastro indisponível para conferir a cobrança.');
      const parsed = JSON.parse(await r.data.text());
      if (!parsed.cooperado?.id) throw new Error('Cadastro inválido para conferir a cobrança.');
      members.push(parsed.cooperado);
    }
  }));
  return members;
}

export function billingData(row: Record<string, unknown>, members: Cooperado[], pricing: CobrancaSaasPricing): AppData {
  const id = String(row.id), cnpj = normalizeCnpj(String(row.cnpj));
  const coop = { id, cnpj, nome: String(row.nome ?? cnpj), cobrancaSaas: row.cobranca_saas as CobrancaSaasCooperativa | undefined } as Cooperativa;
  return applyCobrancaSaasPricingToData({ ...emptyInitialData, cooperativas: [coop], cooperados: members.map(m => ({ ...m, cooperativaId: id })) }, pricing);
}

export async function readPlatformBilling(sb: SupabaseClient, pricing: CobrancaSaasPricing) {
  const coops: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 500) {
    const r = await sb.from('cooperativas').select('id,nome,cnpj,cobranca_saas,updated_at').order('id').range(offset, offset + 499);
    if (r.error || !Array.isArray(r.data)) throw new Error('Não foi possível conferir todas as cooperativas.');
    coops.push(...r.data);
    if (r.data.length < 500) break;
  }
  const rows: ReturnType<typeof listarCobrancasSaasAdmin> = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(3, coops.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= coops.length) return;
      const coop = coops[index], cnpj = normalizeCnpj(String(coop.cnpj));
      if (cnpj.length !== 14) throw new Error('CNPJ inválido na base de cobrança.');
      const members = await readBillingMembers(sb, cnpj);
      rows.push(...listarCobrancasSaasAdmin(billingData(coop, members, pricing)));
    }
  }));
  return rows.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
