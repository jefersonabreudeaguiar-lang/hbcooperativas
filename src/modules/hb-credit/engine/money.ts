/** Compatibilidade — núcleo monetário centralizado na fundação. */
import { computeAvailableCents, toMoneyCents } from "../shared/money";

export {
  reaisToCents,
  centsToReais,
  formatCentsBRL,
  assertTresValores,
} from "../shared/money";

/** Aceita números da camada operacional (API/storage) e delega ao núcleo tipado. */
export function computeDisponivel(limitReleased: number, amountUsed: number): number {
  return computeAvailableCents(toMoneyCents(limitReleased), toMoneyCents(amountUsed));
}
