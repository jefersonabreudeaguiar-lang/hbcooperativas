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

export function staffGestaoAppDataParaPainel(coopId?: string): AppData | null {
  const lkg = peekStaffGestaoLastGood();
  if (!isAppDataWarm()) return lkg;
  const warm = getData();
  if (!lkg) return warm;
  const rWarm = staffGestaoRiquezaTotal(medirRiquezaStaffGestao(warm, coopId));
  const rLkg = staffGestaoRiquezaTotal(medirRiquezaStaffGestao(lkg, coopId));
  return rLkg > rWarm ? lkg : warm;
}

/** Revisão para stats do Início — lastro no 1º quadro antes do persist. */
export function staffGestaoPainelDataRevisionToken(): number {
  if (isAppDataWarm()) return 1;
  return peekStaffGestaoLastGood() ? 0 : -1;
}
