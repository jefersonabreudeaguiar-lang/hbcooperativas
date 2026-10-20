import { getData, isAppDataWarm, updateData } from "@/services/dataStore";
import {
  inferCoopIdComCheckpoint,
  reaplicarAbaLastGoodSeRegrediu,
  restoreAbaLastGood,
  type AbaLastGoodNome,
} from "@/lib/responsavel/abaLastGoodCheckpoint";

/** Reinjeta o último recorte estável da aba no dataStore. Não mexe em notas, HB ou usuários. */
export function tryRestoreAbaLastGoodInStore(aba: AbaLastGoodNome, coopId?: string): boolean {
  try {
    const data = getData();
    const cid = coopId ?? inferCoopIdComCheckpoint(data, aba);
    if (!cid) return false;
    const next = restoreAbaLastGood(data, cid, aba);
    if (!next) return false;
    updateData(() => next);
    return true;
  } catch {
    return false;
  }
}

/** Se o sync/F5 apagou a fila a pagar, devolve o lastro sem reabrir o que já tem PIX. */
export function tryReaplicarPagarLastGoodSeRegrediuInStore(coopId?: string): boolean {
  try {
    if (!isAppDataWarm()) return false;
    const data = getData();
    const cid = coopId ?? inferCoopIdComCheckpoint(data, "pagar");
    if (!cid) return false;
    const next = reaplicarAbaLastGoodSeRegrediu(data, cid, "pagar");
    if (next === data) return false;
    updateData(() => next);
    return true;
  } catch {
    return false;
  }
}
