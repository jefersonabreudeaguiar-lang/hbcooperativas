import type { User } from "@/types";

/**
 * Estado inicial do AuthProvider — sempre igual SSR e 1º paint do cliente (evita React #418).
 * Sessão cooperado GA entra no `useLayoutEffect` → `refresh()` (mesmo frame, antes do paint).
 */
export function cooperadoMobilePilotInitialAccountUser(): Omit<User, "password"> | null {
  return null;
}

export function cooperadoMobilePilotInitialAuthLoading(): boolean {
  return true;
}
