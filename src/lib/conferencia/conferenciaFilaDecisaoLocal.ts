import type { AppData } from "@/types";
import {
  isNotaSaiuDaFilaConferencia,
  notaElegivelParaFilaConferenciaResponsavel,
  notaLancadaNaFichaCorrida,
  sanitizarNotaParaFilaConferencia,
} from "@/utils/notaStatus";

/** Notas já aprovadas/rejeitadas nesta sessão — não voltam à fila até o AppData refletir a decisão. */
const decididasLocalmente = new Set<string>();
const DECIDIDAS_STORAGE_KEY = "hb-conferir-decididas-v1";
let decididasHydrated = false;

function persistDecididasLocalmente(): void {
  if (typeof window === "undefined") return;
  const json = JSON.stringify([...decididasLocalmente]);
  try {
    sessionStorage.setItem(DECIDIDAS_STORAGE_KEY, json);
  } catch {
    /* quota */
  }
  try {
    localStorage.setItem(DECIDIDAS_STORAGE_KEY, json);
  } catch {
    /* quota */
  }
}

function hydrateDecididasLocalmente(): void {
  if (decididasHydrated || typeof window === "undefined") return;
  decididasHydrated = true;
  try {
    const raw = sessionStorage.getItem(DECIDIDAS_STORAGE_KEY) ?? localStorage.getItem(DECIDIDAS_STORAGE_KEY);
    if (!raw) return;
    const ids = JSON.parse(raw) as unknown;
    if (!Array.isArray(ids)) return;
    for (const id of ids) {
      if (typeof id === "string" && id) decididasLocalmente.add(id);
    }
  } catch {
    /* ignore */
  }
}

export function markNotaConferenciaDecididaLocalmente(notaId: string): void {
  if (!notaId) return;
  hydrateDecididasLocalmente();
  decididasLocalmente.add(notaId);
  persistDecididasLocalmente();
}

export function unmarkNotaConferenciaDecididaLocalmente(notaId: string): void {
  hydrateDecididasLocalmente();
  decididasLocalmente.delete(notaId);
  persistDecididasLocalmente();
}

export function isNotaConferenciaDecididaLocalmente(notaId: string): boolean {
  hydrateDecididasLocalmente();
  return decididasLocalmente.has(notaId);
}

export function getNotasConferenciaDecididasLocalmente(): ReadonlySet<string> {
  hydrateDecididasLocalmente();
  return decididasLocalmente;
}

/** Remove IDs quando o estado em memória já saiu da fila (evita crescimento infinito). */
export function reconciliarNotasConferenciaDecididasLocalmente(data: AppData): void {
  hydrateDecididasLocalmente();
  const before = decididasLocalmente.size;
  for (const id of [...decididasLocalmente]) {
    const nota = data.notasPedido.find((n) => n.id === id);
    if (!nota) {
      decididasLocalmente.delete(id);
      continue;
    }
    if (notaLancadaNaFichaCorrida(data.fichaCorrida, id)) continue;
    if (isNotaSaiuDaFilaConferencia(nota.status)) {
      decididasLocalmente.delete(id);
      continue;
    }
    const candidata = sanitizarNotaParaFilaConferencia(nota);
    if (notaElegivelParaFilaConferenciaResponsavel(candidata)) {
      decididasLocalmente.delete(id);
    }
  }
  if (decididasLocalmente.size !== before) persistDecididasLocalmente();
}

/** Recuperação da fila — remove marcas que escondem notas após sync/restore. */
export function limparMarcasConferenciaDecididaLocalmenteParaRecuperacao(): void {
  decididasLocalmente.clear();
  persistDecididasLocalmente();
}

/** Somente testes. */
export function resetNotasConferenciaDecididasLocalmenteForTests(): void {
  decididasLocalmente.clear();
  decididasHydrated = false;
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(DECIDIDAS_STORAGE_KEY);
    localStorage.removeItem(DECIDIDAS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
