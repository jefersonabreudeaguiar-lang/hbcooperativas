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

/** Warm × lastro — sem projeção Pagar (evita reconciliar ficha em todo useAppData). */
export function escolherStaffGestaoSnapshotParaLeitura(coopId?: string): AppData | null {
  const lkg = peekStaffGestaoLastGood();
  if (!isAppDataWarm()) return lkg;
  const warm = getData();
  if (!lkg) return warm;
  const rWarm = staffGestaoRiquezaTotal(medirRiquezaStaffGestao(warm, coopId));
  const rLkg = staffGestaoRiquezaTotal(medirRiquezaStaffGestao(lkg, coopId));
  return rLkg > rWarm ? lkg : warm;
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
