import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotaPedido } from '@/types';
import { nomeCooperadoSnapshotUtilizavel } from '@/lib/cooperado/nomeCooperadoValido';

export function validarNomeNotaParaFila(nota: NotaPedido, fallback?: string): NotaPedido {
  const nome = nomeCooperadoSnapshotUtilizavel(nota.cooperadoNomeSnapshot) ?? nomeCooperadoSnapshotUtilizavel(fallback);
  if (!nome && ['aguardando_conferencia','entregue'].includes(nota.status)) throw Error('Não foi possível identificar o cooperado desta entrega. Atualize os cadastros e tente enviar novamente. A foto deve permanecer na fila de envio.');
  return { ...nota, cooperadoNomeSnapshot: nome };
}

/** Resolve by exact ID inside the requested tenant; never guess by name or image. */
export async function identificarNomeNota(supabase: SupabaseClient, cnpj: string, nota: NotaPedido, fallback?: string): Promise<NotaPedido> {
  let nome: string | undefined;
  if (/^\d{14}$/.test(cnpj) && /^[a-zA-Z0-9_-]+$/.test(nota.cooperadoId)) {
    try {
      const r = await supabase.storage.from('hb-cooperados').download(`${cnpj}/${nota.cooperadoId}.json`, { cacheNonce: crypto.randomUUID() }, { cache: 'no-store' });
      if (!r.error && r.data) {
        const member = JSON.parse(await r.data.text()).cooperado;
        if (member?.id === nota.cooperadoId && (!member.cooperativaCnpj || member.cooperativaCnpj.replace(/\D/g,'') === cnpj)) nome = nomeCooperadoSnapshotUtilizavel(member.nomeCompleto);
      }
    } catch { /* The saved valid snapshot remains a recovery source. */ }
  }
  nome ??= nomeCooperadoSnapshotUtilizavel(nota.cooperadoNomeSnapshot) ?? nomeCooperadoSnapshotUtilizavel(fallback);
  return validarNomeNotaParaFila({ ...nota, cooperadoNomeSnapshot: nome });
}
