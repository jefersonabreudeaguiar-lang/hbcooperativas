import type { User } from "@/types";
import { isCooperadoMobilePilot } from "@/lib/cooperado/cooperadoMobilePilot";
import { getSession } from "@/services/dataStore";

/** Hidrata auth no 1º frame do cliente — só piloto Jeferson (sem flash de loading). */
export function cooperadoMobilePilotInitialAccountUser(): Omit<User, "password"> | null {
  if (typeof window === "undefined") return null;
  const session = getSession();
  if (!session || !isCooperadoMobilePilot(session)) return null;
  return session;
}

export function cooperadoMobilePilotInitialAuthLoading(): boolean {
  if (typeof window === "undefined") return true;
  const session = getSession();
  return !(session && isCooperadoMobilePilot(session));
}
