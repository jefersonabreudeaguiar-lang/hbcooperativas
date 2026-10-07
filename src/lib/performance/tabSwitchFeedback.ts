import { markRqlInteractionPhase } from "@/lib/performance/rqlMarks";

const TAB_PULSE_MS = 180;

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

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Pulso visual no ícone — complementa vibrate (ex.: iOS Safari). */
export function pulsoVisualTrocaAba(iconEl: HTMLElement | null | undefined): void {
  if (!iconEl || prefersReducedMotion()) return;
  iconEl.classList.remove("hb-tab-switch-pulse");
  // reflow para reiniciar animação em trocas seguidas
  void iconEl.offsetWidth;
  iconEl.classList.add("hb-tab-switch-pulse");
  window.setTimeout(() => iconEl.classList.remove("hb-tab-switch-pulse"), TAB_PULSE_MS);
}

/** Só vibra quando o toque realmente muda de aba (não re-tap na ativa). */
export function feedbackTrocaAbaMobile(
  alvoAtivo: boolean,
  iconEl?: HTMLElement | null
): void {
  if (alvoAtivo) return;
  if (!isMobileBottomTabViewport()) return;
  requestAnimationFrame(() => {
    vibrarTrocaAba();
    pulsoVisualTrocaAba(iconEl);
    markRqlInteractionPhase("cooperado-tab-switch");
  });
}
