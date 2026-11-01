/**
 * Leitura do painel gestão — preferir o snapshot mais rico (warm × lastro).
 */
import type { AppData } from "@/types";
import { getData, isAppDataWarm } from "@/services/dataStore";
import {
  medirRiquezaStaffGestao,
  peekStaffGestaoLastGood,
  staffGestaoRiquezaTotal,
} from "@/lib/staff/staffGestaoSnapshotGuard";
import { appDataParaPagarCooperadosResponsavel } from "@/services/responsavelPainelIndex";
import { aplicarCatalogoCloudLeitura } from "@/lib/staff/staffCatalogoCloudLeitura";

/** O lastro financeiro não pode substituir o catálogo atual por uma cópia antiga. */
export function alinharCatalogoSnapshotStaff(base: AppData, atual: AppData): AppData {
  const ids = new Set([
    ...atual.instituicoes.map((i) => i.cooperativaId),
    ...atual.produtosInstituicao.map((p) => p.cooperativaId),
    ...(atual.instituicoesExcluidas ?? []).map((e) => e.cooperativaId),
  ]);
  if (ids.size === 0 || base === atual) return base;
  return {
    ...base,
    instituicoes: [...base.instituicoes.filter((i) => !ids.has(i.cooperativaId)), ...atual.instituicoes],
    produtosInstituicao: [...base.produtosInstituicao.filter((p) => !ids.has(p.cooperativaId)), ...atual.produtosInstituicao],
    instituicoesExcluidas: [...(base.instituicoesExcluidas ?? []).filter((e) => !ids.has(e.cooperativaId)), ...(atual.instituicoesExcluidas ?? [])],
    cronogramasContrato: [...(base.cronogramasContrato ?? []).filter((c) => !ids.has(c.cooperativaId)), ...(atual.cronogramasContrato ?? []).filter((c) => ids.has(c.cooperativaId))],
  };
}

/** Warm × lastro — sem projeção Pagar (evita reconciliar ficha em todo useAppData). */
export function escolherStaffGestaoSnapshotParaLeitura(coopId?: string): AppData | null {
  const lkg = peekStaffGestaoLastGood();
  if (!isAppDataWarm()) return lkg ? aplicarCatalogoCloudLeitura(lkg) : null;
  const warm = getData();
  if (!lkg) return aplicarCatalogoCloudLeitura(warm);
  const rWarm = staffGestaoRiquezaTotal(medirRiquezaStaffGestao(warm, coopId));
  const rLkg = staffGestaoRiquezaTotal(medirRiquezaStaffGestao(lkg, coopId));
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
