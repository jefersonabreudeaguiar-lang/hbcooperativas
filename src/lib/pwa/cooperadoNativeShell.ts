/**
 * Fase 3 (opcional) — gancho para wrapper nativo (Capacitor/TWA): ícone + push, sem reescrever regras.
 * Hoje o cooperado usa PWA; este módulo evita acoplar detecção nativa nas telas.
 */

export function isCooperadoNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean((window as Window & { Capacitor?: unknown }).Capacitor);
  } catch {
    return false;
  }
}
