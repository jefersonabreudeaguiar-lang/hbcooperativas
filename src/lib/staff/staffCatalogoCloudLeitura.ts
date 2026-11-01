import type { AppData } from "@/types";
import type { ContratosSyncPayload } from "@/lib/supabase/cooperativaSyncStorage";
import { touchAppDataDomains } from "@/lib/performance/appDataDomainNotify";

const catalogos = new Map<string, ContratosSyncPayload>();
let revisaoCatalogo = 0;
const leituras = new WeakMap<AppData, { revisao: number; data: AppData }>();

export function registrarCatalogoCloudLeitura(coopId: string, payload: ContratosSyncPayload): void {
  const anterior = catalogos.get(coopId);
  if (anterior && JSON.stringify(anterior) === JSON.stringify(payload)) return;
  catalogos.set(coopId, payload);
  revisaoCatalogo++;
  touchAppDataDomains(["shell"]);
}

export function invalidarCatalogoCloudLeitura(coopId: string): void {
  if (catalogos.delete(coopId)) {
    revisaoCatalogo++;
    touchAppDataDomains(["shell"]);
  }
}

/** Catálogo recebido nesta sessão não depende do lastro financeiro nem do persist antigo. */
export function aplicarCatalogoCloudLeitura(base: AppData): AppData {
  if (catalogos.size === 0) return base;
  const cached = leituras.get(base);
  if (cached?.revisao === revisaoCatalogo) return cached.data;
  let next = base;
  for (const [coopId, payload] of catalogos) {
    const excluidas = (payload.instituicoesExcluidas ?? []).map((e) => ({ ...e, cooperativaId: coopId }));
    const ids = new Set(excluidas.map((e) => e.id));
    next = {
      ...next,
      instituicoes: [...next.instituicoes.filter((i) => i.cooperativaId !== coopId), ...payload.instituicoes.filter((i) => !ids.has(i.id)).map((i) => ({ ...i, cooperativaId: coopId }))],
      produtosInstituicao: [...next.produtosInstituicao.filter((p) => p.cooperativaId !== coopId), ...payload.produtosInstituicao.filter((p) => !ids.has(p.instituicaoId)).map((p) => ({ ...p, cooperativaId: coopId }))],
      instituicoesExcluidas: [...(next.instituicoesExcluidas ?? []).filter((e) => e.cooperativaId !== coopId), ...excluidas],
      cronogramasContrato: [...(next.cronogramasContrato ?? []).filter((c) => c.cooperativaId !== coopId), ...(payload.cronogramasContrato ?? []).map((c) => ({ ...c, cooperativaId: coopId }))],
    };
  }
  leituras.set(base, { revisao: revisaoCatalogo, data: next });
  return next;
}
