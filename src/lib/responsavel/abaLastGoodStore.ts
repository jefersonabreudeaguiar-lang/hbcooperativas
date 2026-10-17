import { getData, updateData } from "@/services/dataStore";
import {
  inferCoopIdComCheckpoint,
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
