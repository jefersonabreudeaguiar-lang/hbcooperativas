/** Pausa entre frames do slideshow de lançamento na ficha (multi-foto). */
export function slideMsConferenciaLancamentoSequencia(totalFotos: number): number {
  return totalFotos === 1 ? 550 : 650;
}

export function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
