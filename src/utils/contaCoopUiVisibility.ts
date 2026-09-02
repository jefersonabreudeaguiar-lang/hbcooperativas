import type { User } from "@/types";

const ALLOWED_ON = new Set(["true", "1"]);

/** Cooperado usado nos testes de homologação da Conta Coop. */
const CONTA_COOP_TESTE_NOME = "orlando";

/** Orlando Fetisch — piloto de abatimento Conta Coop no valor a receber. */
export const CONTA_COOP_PILOT_COOPERADO_ID = "c_1782263929381_ncp55";

export const CONTA_COOP_NAV_HREFS = ["/conta-coop", "/minha-conta-coop", "/mercado-parceiro"] as const;

function parsePublicFlag(): boolean {
  return ALLOWED_ON.has((process.env.NEXT_PUBLIC_CONTA_COOP_UI_PUBLIC ?? "").trim().toLowerCase());
}

/**
 * Quando true (env NEXT_PUBLIC_CONTA_COOP_UI_PUBLIC=1), a Conta Coop aparece para todos.
 * Enquanto false, só o cooperado Orlando vê o menu; demais cooperados ficam sem o item.
 */
export function isContaCoopUiPublic(): boolean {
  return parsePublicFlag();
}

function normalizeNome(n: string): string {
  return n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function matchesOrlandoTeste(displayName: string): boolean {
  const n = normalizeNome(displayName);
  if (!n) return false;
  return n.includes(CONTA_COOP_TESTE_NOME) || n.split(/\s+/)[0] === CONTA_COOP_TESTE_NOME;
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
  cooperadoNome?: string
): boolean {
  if (isContaCoopUiPublic()) return true;
  if (user.role !== "cooperado") return true;
  return matchesOrlandoTeste(resolveContaCoopDisplayName(user, cooperadoNome));
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
