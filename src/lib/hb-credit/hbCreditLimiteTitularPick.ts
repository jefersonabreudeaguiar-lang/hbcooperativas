/**
 * Regras de titular HB — sem dependência de contaCoopStorage (seguro em Client Components).
 */
import type { ContaCoopLimiteCooperado } from "@/modules/hb-credit/types";
import type { Cooperado } from "@/types";

function cpfDigits(cpf?: string): string {
  return (cpf ?? "").replace(/\D/g, "");
}

function nomeNorm(n: string): string {
  return n.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Mesmo titular (CPF/nome) — compras HB podem estar em ID duplicado. */
export function titularCooperadoIds(cooperados: Cooperado[], cooperadoId: string): string[] {
  const ids = new Set<string>([cooperadoId]);
  const ref = cooperados.find((c) => c.id === cooperadoId);
  if (!ref) return [...ids];
  const cpf = cpfDigits(ref.cpfCnpj);
  const nome = nomeNorm(ref.nomeCompleto);
  for (const c of cooperados) {
    if (cpf.length >= 11 && cpfDigits(c.cpfCnpj) === cpf) ids.add(c.id);
    else if (nome && nomeNorm(c.nomeCompleto) === nome) ids.add(c.id);
  }
  return [...ids];
}

function hbAccountReleasedCents(row: Record<string, unknown>): number {
  return Math.max(0, Math.round(Number(row.limit_released_cents ?? 0)));
}

function hbAccountUpdatedMs(row: Record<string, unknown>): number {
  const t = Date.parse(String(row.updated_at ?? ""));
  return Number.isFinite(t) ? t : 0;
}

/** Conta HB na nuvem quando há IDs duplicados (mesmo titular) — maior crédito disponível. */
export function pickBestHbCreditAccountRow(
  rows: Record<string, unknown>[]
): Record<string, unknown> | null {
  if (!rows.length) return null;
  let best = rows[0];
  for (const row of rows) {
    const released = hbAccountReleasedCents(row);
    const used = Math.max(0, Math.round(Number(row.amount_used_cents ?? 0)));
    const disponivel = Math.max(0, released - used);
    const bestReleased = hbAccountReleasedCents(best);
    const bestUsed = Math.max(0, Math.round(Number(best.amount_used_cents ?? 0)));
    const bestDisponivel = Math.max(0, bestReleased - bestUsed);

    if (disponivel > bestDisponivel) {
      best = row;
      continue;
    }
    if (disponivel === bestDisponivel && released > bestReleased) {
      best = row;
      continue;
    }
    if (
      disponivel === bestDisponivel &&
      released === bestReleased &&
      hbAccountUpdatedMs(row) > hbAccountUpdatedMs(best)
    ) {
      best = row;
    }
  }
  return best;
}

/** Mesma regra da API GET /credit/account para a aba Limites (staff). */
export function melhorLimiteCooperadoTitular(
  limites: ContaCoopLimiteCooperado[],
  cooperados: Cooperado[],
  cooperadoId: string
): ContaCoopLimiteCooperado | null {
  const titularIds = new Set(titularCooperadoIds(cooperados, cooperadoId));
  let best: ContaCoopLimiteCooperado | undefined;
  for (const l of limites) {
    if (!titularIds.has(l.cooperadoId)) continue;
    if (!best) {
      best = l;
      continue;
    }
    if (l.valorDisponivelCents > best.valorDisponivelCents) {
      best = l;
      continue;
    }
    if (l.valorDisponivelCents === best.valorDisponivelCents && l.limiteLiberadoCents > best.limiteLiberadoCents) {
      best = l;
      continue;
    }
    if (
      l.valorDisponivelCents === best.valorDisponivelCents &&
      l.limiteLiberadoCents === best.limiteLiberadoCents
    ) {
      const tu = Date.parse(l.updatedAt || "") || 0;
      const bu = Date.parse(best.updatedAt || "") || 0;
      if (tu > bu) best = l;
    }
  }
  return best ?? null;
}
