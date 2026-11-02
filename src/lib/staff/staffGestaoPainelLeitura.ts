/**
 * Leitura do painel gestão — preferir o snapshot mais rico (warm × lastro).
 */
import { mergeArquivosMensaisFromCloud } from "@/services/notaPedidoService";
import { unirValoresAvulsosReceber } from "@/services/valoresAvulsosReceberService";
import type { AppData } from "@/types";
import { getData, isAppDataWarm } from "@/services/dataStore";
import {
  medirRiquezaStaffGestao,
  peekStaffGestaoLastGood,
  staffGestaoRiquezaTotal,
} from "@/lib/staff/staffGestaoSnapshotGuard";
import { appDataParaPagarCooperadosResponsavel } from "@/services/responsavelPainelIndex";
import { aplicarCatalogoCloudLeitura } from "@/lib/staff/staffCatalogoCloudLeitura";
const riquezaCache = new WeakMap<AppData, Map<string, number>>();
function riqueza(data: AppData, coopId?: string): number {
  let cache = riquezaCache.get(data);
  if (!cache) { cache = new Map(); riquezaCache.set(data, cache); }
  const key = coopId ?? "";
  let value = cache.get(key);
  if (value === undefined) { value = staffGestaoRiquezaTotal(medirRiquezaStaffGestao(data, coopId)); cache.set(key, value); }
  return value;
}
const catalogoAlinhadoCache = new WeakMap<AppData, { atual: AppData; data: AppData }>();

/** O lastro financeiro não pode substituir o catálogo atual por uma cópia antiga. */
export function alinharCatalogoSnapshotStaff(base: AppData, atual: AppData): AppData {
  if (base === atual) return base;
  const cached = catalogoAlinhadoCache.get(base);
  if (cached?.atual === atual) return cached.data;
  const ids = new Set([
    ...atual.instituicoes.map((i) => i.cooperativaId),
    ...atual.produtosInstituicao.map((p) => p.cooperativaId),
    ...(atual.instituicoesExcluidas ?? []).map((e) => e.cooperativaId),
  ]);

  const next = {
    ...base,
    arquivosMensais: mergeArquivosMensaisFromCloud(atual, base.arquivosMensais, atual.arquivosMensais),
    valoresAvulsosReceber: unirValoresAvulsosReceber(base.valoresAvulsosReceber, atual.valoresAvulsosReceber),
    instituicoes: [...base.instituicoes.filter((i) => !ids.has(i.cooperativaId)), ...atual.instituicoes],
    produtosInstituicao: [...base.produtosInstituicao.filter((p) => !ids.has(p.cooperativaId)), ...atual.produtosInstituicao],
    instituicoesExcluidas: [...(base.instituicoesExcluidas ?? []).filter((e) => !ids.has(e.cooperativaId)), ...(atual.instituicoesExcluidas ?? [])],
    cronogramasContrato: [...(base.cronogramasContrato ?? []).filter((c) => !ids.has(c.cooperativaId)), ...(atual.cronogramasContrato ?? []).filter((c) => ids.has(c.cooperativaId))],
  };
  catalogoAlinhadoCache.set(base, { atual, data: next });
  return next;
}

/** Warm × lastro — sem projeção Pagar (evita reconciliar ficha em todo useAppData). */
export function escolherStaffGestaoSnapshotParaLeitura(coopId?: string): AppData | null {
  const lkg = peekStaffGestaoLastGood();
  if (!isAppDataWarm()) return lkg ? aplicarCatalogoCloudLeitura(lkg) : null;
  const warm = getData();
  if (!lkg) return aplicarCatalogoCloudLeitura(warm);
  const rWarm = riqueza(warm, coopId);
  const rLkg = riqueza(lkg, coopId);
  return aplicarCatalogoCloudLeitura(rLkg > rWarm ? alinharCatalogoSnapshotStaff(lkg, warm) : warm);
}

function escolherStaffGestaoSnapshotBase(coopId?: string): AppData | null {
  return escolherStaffGestaoSnapshotParaLeitura(coopId);
}

/** Painel gestão: snapshot mais rico (warm × lastro) + projeção Pagar quando há escopo. */
export function staffGestaoAppDataParaPainel(coopId?: string): AppData | null {
  const base = escolherStaffGestaoSnapshotBase(coopId);
  if (!base) return null;
  if (!coopId) return base;
  try {
    return appDataParaPagarCooperadosResponsavel(base, coopId);
  } catch (err) {
    console.warn("[staffGestaoAppDataParaPainel] projeção Pagar falhou — usa snapshot base", err);
    return base;
  }
}

/** Revisão para stats do Início — lastro no 1º quadro antes do persist. */
export function staffGestaoPainelDataRevisionToken(): number {
  if (isAppDataWarm()) return 1;
  return peekStaffGestaoLastGood() ? 0 : -1;
}
