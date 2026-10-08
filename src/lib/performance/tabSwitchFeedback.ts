import { useLayoutEffect, useRef } from "react";
import { markRqlInteractionPhase } from "@/lib/performance/rqlMarks";
import { isCooperadoBottomTabPath } from "@/lib/performance/cooperadoBottomTabRoutes";
import {
  isStaffBottomTabPath,
  staffBottomTabCacheKey,
} from "@/lib/performance/staffBottomTabRoutes";

const TAB_PULSE_MS = 180;

export type HbMobileBottomTabProfile = "cooperado" | "staff";

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

export type HbTabSwitchRqlPhase = "cooperado-tab-switch" | "staff-tab-switch";

function resolveMobileBottomTabKey(
  pathname: string,
  profile: HbMobileBottomTabProfile
): string | null {
  if (profile === "cooperado") {
    return isCooperadoBottomTabPath(pathname) ? pathname : null;
  }
  return isStaffBottomTabPath(pathname) ? staffBottomTabCacheKey(pathname) : null;
}

function pulsoVisualAbaAtivaRodape(): void {
  requestAnimationFrame(() => {
    const icon = document.querySelector<HTMLElement>(
      "nav .hb-mobile-tab-link[aria-current='page'] [data-hb-tab-icon]"
    );
    pulsoVisualTrocaAba(icon);
  });
}

/** Feedback após a rota da aba inferior ter mudado (não no pointer/click). */
export function feedbackTrocaAbaConfirmada(rqlPhase: HbTabSwitchRqlPhase): void {
  if (!isMobileBottomTabViewport()) return;
  vibrarTrocaAba();
  pulsoVisualAbaAtivaRodape();
  markRqlInteractionPhase(rqlPhase);
}

/**
 * Vibra/pulsa somente quando pathname confirma troca entre abas do rodapé.
 * Não dispara na montagem inicial nem ao re-tocar a aba já ativa.
 */
export function useMobileBottomTabSwitchFeedback(
  pathname: string,
  profile: HbMobileBottomTabProfile | null
): void {
  const tabKeyRef = useRef<string | null>(null);
  const bootstrappedRef = useRef(false);

  useLayoutEffect(() => {
    if (!profile) return;

    const nextKey = resolveMobileBottomTabKey(pathname, profile);
    const prevKey = tabKeyRef.current;

    if (nextKey) {
      tabKeyRef.current = nextKey;
    }

    if (!bootstrappedRef.current) {
      bootstrappedRef.current = true;
      return;
    }

    if (!nextKey || !prevKey || nextKey === prevKey) return;

    feedbackTrocaAbaConfirmada(
      profile === "cooperado" ? "cooperado-tab-switch" : "staff-tab-switch"
    );
  }, [pathname, profile]);
}
