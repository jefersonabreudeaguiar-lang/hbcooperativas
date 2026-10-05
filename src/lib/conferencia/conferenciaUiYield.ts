/** Libera o thread principal antes de trocar nota na conferência (evita trava perceptível). */
export function yieldConferenciaUiFrame(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}
