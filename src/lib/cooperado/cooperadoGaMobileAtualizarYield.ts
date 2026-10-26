/** Deixa o chip «Atualizando…» pintar antes de parse/sync pesado no celular. */
export function yieldCooperadoMobileUiBeforeHeavyWork(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}
