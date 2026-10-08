/**
 * Sync operacional cooperado — após shell interativo ou primeira interação,
 * nunca no caminho crítico de montagem do AppShell.
 */

let postShellSyncDepth = 0;

export function scheduleCooperadoPostShellSync(run: () => void): void {
  if (typeof window === "undefined") return;

  let fired = false;
  const exec = () => {
    if (fired) return;
    fired = true;
    cleanup();
    run();
  };

  const cleanup = () => {
    window.removeEventListener("pointerdown", onPointer, true);
    window.removeEventListener("keydown", onKey, true);
  };

  const onPointer = () => exec();
  const onKey = () => exec();

  window.addEventListener("pointerdown", onPointer, { capture: true, passive: true });
  window.addEventListener("keydown", onKey, { capture: true, passive: true });

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(exec, { timeout: 2_500 });
      } else {
        window.setTimeout(exec, 1_800);
      }
    });
  });
}

/** Evita rajada de sync pós-shell na mesma abertura. */
export function cooperadoPostShellSyncPermitido(): boolean {
  return postShellSyncDepth === 0;
}

export function markCooperadoPostShellSyncStarted(): void {
  postShellSyncDepth += 1;
}

export function clearCooperadoPostShellSyncStarted(): void {
  postShellSyncDepth = Math.max(0, postShellSyncDepth - 1);
}
