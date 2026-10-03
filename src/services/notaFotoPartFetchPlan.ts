/**
 * Fase 7.2 — planejamento de fetch de parte de foto (sem HTTP).
 * Uma tentativa por índice solicitado; sem cascata 0..7.
 */
export type NotaFotoPartFetchPlanOptions = {
  /** fotosEnviadasCount confiável (ex.: contarFotosEnviadasNota) */
  partCount?: number;
};

export type NotaFotoPartFetchPlan =
  | { action: "fetch"; index: number }
  | { action: "skip"; reason: "invalid_index" | "out_of_range" };

export function planNotaFotoPartFetch(
  index: number,
  options?: NotaFotoPartFetchPlanOptions
): NotaFotoPartFetchPlan {
  if (!Number.isFinite(index) || index < 0 || !Number.isInteger(index)) {
    return { action: "skip", reason: "invalid_index" };
  }

  const partCount = options?.partCount;
  if (
    partCount != null &&
    Number.isFinite(partCount) &&
    partCount > 0 &&
    index >= partCount
  ) {
    return { action: "skip", reason: "out_of_range" };
  }

  return { action: "fetch", index };
}

/** Contagem de tentativas HTTP previstas (0 ou 1). */
export function countPlannedFotoPartFetchAttempts(
  index: number,
  options?: NotaFotoPartFetchPlanOptions
): number {
  return planNotaFotoPartFetch(index, options).action === "fetch" ? 1 : 0;
}
