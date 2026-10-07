/** Agenda trabalho pesado após o handler de toque/navegação retornar (menos long tasks). */
export function deferAfterPointerHandler(run: () => void): void {
  if (typeof window === "undefined") return;
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(run, { timeout: 80 });
      } else {
        queueMicrotask(run);
      }
    });
    return;
  }
  queueMicrotask(run);
}
