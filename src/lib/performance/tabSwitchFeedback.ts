/** Tick curto ao trocar aba no rodapé — paridade com apps de mensagem (seleção). */
export function vibrarTrocaAba(): void {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  try {
    navigator.vibrate(10);
  } catch {
    /* ignore */
  }
}

export function isMobileBottomTabViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 1023px)").matches;
}

/** Só vibra quando o toque realmente muda de aba (não re-tap na ativa). */
export function feedbackTrocaAbaMobile(alvoAtivo: boolean): void {
  if (alvoAtivo) return;
  if (!isMobileBottomTabViewport()) return;
  vibrarTrocaAba();
}
