import type { User } from "@/types";

/** Piloto homologação v2 — Orlando (CoopeagriPla). */
export const COOPERADO_V2_PILOT_COOPERADO_ID = "c_1782263929381_ncp55";

export const COOPERADO_V2_BASE = "/cooperado-v2";

export const COOPERADO_V2_TABS = [
  { href: `${COOPERADO_V2_BASE}/inicio`, label: "Início" },
  { href: `${COOPERADO_V2_BASE}/entregas`, label: "Entregas" },
  { href: `${COOPERADO_V2_BASE}/precos`, label: "Preços" },
  { href: `${COOPERADO_V2_BASE}/financeiro`, label: "Financeiro" },
] as const;

export function isCooperadoV2PilotUser(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado") return false;
  const id = user.cooperadoId?.trim();
  if (id === COOPERADO_V2_PILOT_COOPERADO_ID) return true;
  return user.mobileCooperadoId === COOPERADO_V2_PILOT_COOPERADO_ID;
}
