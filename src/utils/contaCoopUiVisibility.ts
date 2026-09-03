import type { User } from "@/types";

const DISABLED_VALUES = new Set(["0", "false"]);

/** Orlando Fetisch — referência histórica do piloto inicial (sem restrição de UI). */
export const CONTA_COOP_PILOT_COOPERADO_ID = "c_1782263929381_ncp55";

export const CONTA_COOP_NAV_HREFS = ["/conta-coop", "/minha-conta-coop", "/mercado-parceiro"] as const;

function parsePublicFlag(defaultEnabled: boolean): boolean {
  const raw = (process.env.NEXT_PUBLIC_CONTA_COOP_UI_PUBLIC ?? (defaultEnabled ? "1" : ""))
    .trim()
    .toLowerCase();
  if (!raw) return defaultEnabled;
  if (DISABLED_VALUES.has(raw)) return false;
  return true;
}

/**
 * Conta Coop visível para todos os cooperados por padrão.
 * NEXT_PUBLIC_CONTA_COOP_UI_PUBLIC=0 desativa temporariamente (rollback).
 */
export function isContaCoopUiPublic(): boolean {
  return parsePublicFlag(true);
}

export function resolveContaCoopDisplayName(
  user: Pick<User, "name" | "email" | "cooperadoId">,
  cooperadoNome?: string
): string {
  return (cooperadoNome ?? user.name ?? user.email?.split("@")[0] ?? "").trim();
}

/** Visibilidade da Conta Coop na navegação — não altera permissões nem rotas. */
export function isContaCoopUiVisibleForUser(
  user: Pick<User, "role" | "name" | "email" | "cooperadoId">,
  _cooperadoNome?: string
): boolean {
  if (user.role !== "cooperado") return true;
  return isContaCoopUiPublic();
}

/**
 * Abate compras Conta Coop (mercado) no valor a receber — vale para todos os cooperados ativos.
 * NEXT_PUBLIC_CONTA_COOP_VALOR_RECEBER_PUBLIC=0 desativa temporariamente (rollback).
 */
export function isContaCoopValorReceberPilot(cooperadoId?: string, cooperadoNome?: string): boolean {
  void cooperadoId;
  void cooperadoNome;
  const raw = (process.env.NEXT_PUBLIC_CONTA_COOP_VALOR_RECEBER_PUBLIC ?? "1").trim().toLowerCase();
  return raw !== "0" && raw !== "false";
}

export function filterContaCoopNavItems<T extends { href: string; resource?: string }>(
  items: T[],
  visible: boolean
): T[] {
  if (visible) return items;
  return items.filter(
    (i) =>
      i.resource !== "conta_coop" &&
      !CONTA_COOP_NAV_HREFS.includes(i.href as (typeof CONTA_COOP_NAV_HREFS)[number])
  );
}
