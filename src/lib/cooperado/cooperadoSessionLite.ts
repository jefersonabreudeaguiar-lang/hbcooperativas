import type { User } from "@/types";

const SESSION_KEY = "coopeagriplla_session";

/** Lê sessão sem `getData()` — evita ciclo com dataStore na abertura. */
export function readCooperadoSessionLite(): Omit<User, "password"> | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Omit<User, "password">;
    return parsed?.id ? parsed : null;
  } catch {
    return null;
  }
}

export function cooperadoGaMobileViewportAtivoLite(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(max-width: 1023px)").matches;
  } catch {
    return true;
  }
}
