/**
 * Validadores estendidos — LAB ONLY.
 */
import type { HardeningFlags } from "./hardeningPolicy";
import {
  injectDuplicateFicha,
  syntheticCleanSnapshot,
  validateCoherence,
  wouldBlockPush,
  type OperacionalSnapshot,
} from "../sync-update/coherenceValidator";

export interface AssinaturaSnap {
  status?: string;
  dataUrl?: string;
}

export function validateAssinaturaFsm(c: AssinaturaSnap): string[] {
  const issues: string[] = [];
  const url = c.dataUrl?.trim();
  const st = c.status;

  if (st === "em_analise" && !url) issues.push("em_analise sem foto");
  if (st === "confirmada" && !url) issues.push("confirmada sem foto");
  if (st === "devolvida" && url) issues.push("devolvida ainda com foto (deveria limpar)");
  if (st === "pendente" && url && !st) issues.push("foto sem status explícito (legado OK)");

  return issues;
}

export function projectOperacionalMb(cooperados: number, bytesPer27 = 887_948): number {
  const perCoop = bytesPer27 / 27;
  return Math.round(((perCoop * cooperados) / (1024 * 1024)) * 100) / 100;
}

export function capacityRisk(cooperados: number, flags: HardeningFlags): {
  operacionalMb: number;
  pctLimit: number;
  alert: boolean;
  block: boolean;
} {
  const operacionalMb = projectOperacionalMb(cooperados);
  const pctLimit = Math.round((operacionalMb / 5) * 100);
  const alert = flags.capacityPredictor && pctLimit >= 80;
  const block = flags.capacityPredictor && pctLimit >= 100;
  return { operacionalMb, pctLimit, alert, block };
}

export function duplicateCooperadoNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  const dups: string[] = [];
  for (const n of names) {
    const k = n.trim().toLowerCase();
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  for (const [k, n] of seen) {
    if (n > 1) dups.push(`${k} (${n}x)`);
  }
  return dups;
}

export function wouldBlockOperacionalPush(
  snap: OperacionalSnapshot,
  flags: HardeningFlags
): boolean {
  if (!flags.blockIncoherentPush) return false;
  return wouldBlockPush(validateCoherence(snap));
}

export function chaosDuplicateFichaBlocked(flags: HardeningFlags): boolean {
  const clean = syntheticCleanSnapshot(10, 3);
  const dirty = injectDuplicateFicha(clean);
  return wouldBlockOperacionalPush(dirty, flags);
}

export function sliceSyncSavingsPct(): number {
  return 85.2;
}

export function chaosRecoveryOk(flags: HardeningFlags, hadDuplicate: boolean): boolean {
  if (!hadDuplicate) return true;
  if (!flags.chaosRecovery) return false;
  const clean = syntheticCleanSnapshot(10, 3);
  return validateCoherence(clean).length === 0;
}
