import type { AppData } from "@/types";
import type { ContratosSyncPayload } from "@/lib/supabase/cooperativaSyncStorage";
import { touchAppDataDomains } from "@/lib/performance/appDataDomainNotify";

const catalogos = new Map<string, ContratosSyncPayload>();

export function registrarCatalogoCloudLeitura(coopId: string, payload: ContratosSyncPayload): void {
  catalogos.set(coopId, payload);
  touchAppDataDomains(["shell"]);
}

export function invalidarCatalogoCloudLeitura(coopId: string): void {
  if (catalogos.delete(coopId)) touchAppDataDomains(["shell"]);
}

/** Catálogo recebido nesta sessão não depende do lastro financeiro nem do persist antigo. */
export function aplicarCatalogoCloudLeitura(base: AppData): AppData {
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
  return next;
}
