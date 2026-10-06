import type { AppData } from "@/types";
import {
  isNotaSaiuDaFilaConferencia,
  notaElegivelParaFilaConferenciaResponsavel,
  sanitizarNotaParaFilaConferencia,
} from "@/utils/notaStatus";

/** Notas já aprovadas/rejeitadas nesta sessão — não voltam à fila até o AppData refletir a decisão. */
const decididasLocalmente = new Set<string>();

export function markNotaConferenciaDecididaLocalmente(notaId: string): void {
  if (!notaId) return;
  decididasLocalmente.add(notaId);
}

export function unmarkNotaConferenciaDecididaLocalmente(notaId: string): void {
  decididasLocalmente.delete(notaId);
}

export function isNotaConferenciaDecididaLocalmente(notaId: string): boolean {
  return decididasLocalmente.has(notaId);
}

export function getNotasConferenciaDecididasLocalmente(): ReadonlySet<string> {
  return decididasLocalmente;
}

/** Remove IDs quando o estado em memória já saiu da fila (evita crescimento infinito). */
export function reconciliarNotasConferenciaDecididasLocalmente(data: AppData): void {
  for (const id of [...decididasLocalmente]) {
    const nota = data.notasPedido.find((n) => n.id === id);
    if (!nota) {
      decididasLocalmente.delete(id);
      continue;
    }
    if (isNotaSaiuDaFilaConferencia(nota.status)) {
      decididasLocalmente.delete(id);
      continue;
    }
    const candidata = sanitizarNotaParaFilaConferencia(nota);
    if (notaElegivelParaFilaConferenciaResponsavel(candidata)) {
      decididasLocalmente.delete(id);
    }
  }
}

/** Recuperação da fila — remove marcas que escondem notas após sync/restore. */
export function limparMarcasConferenciaDecididaLocalmenteParaRecuperacao(): void {
  decididasLocalmente.clear();
}

/** Somente testes. */
export function resetNotasConferenciaDecididasLocalmenteForTests(): void {
  decididasLocalmente.clear();
}
