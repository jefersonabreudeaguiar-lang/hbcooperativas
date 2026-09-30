/** Validação server-side de creditosBaseCents enviados pelo cliente (não são fonte autoritativa). */

export const MAX_CREDITO_BASE_CENTS = 100_000_000_00;

export type CreditosBaseValidation =
  | { ok: true; sanitized: Record<string, number> }
  | { ok: false; error: string; code: string };

export function validateCreditosBaseCents(
  raw: unknown,
  options?: { allowedCooperadoIds?: string[]; requireNonEmpty?: boolean }
): CreditosBaseValidation {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Mapa de crédito-base inválido.", code: "INVALID_MAP" };
  }

  const sanitized: Record<string, number> = {};
  const entries = Object.entries(raw as Record<string, unknown>);

  if (options?.requireNonEmpty && entries.length === 0) {
    return { ok: false, error: "Crédito-base não informado.", code: "EMPTY_MAP" };
  }

  for (const [cooperadoId, value] of entries) {
    if (!cooperadoId.trim()) {
      return { ok: false, error: "Identificador de cooperado inválido.", code: "INVALID_ID" };
    }
    if (options?.allowedCooperadoIds && !options.allowedCooperadoIds.includes(cooperadoId)) {
      return {
        ok: false,
        error: "Cooperado não pertence ao contexto autorizado.",
        code: "UNAUTHORIZED_COOPERADO",
      };
    }
    const num = Number(value);
    if (!Number.isFinite(num) || !Number.isInteger(num)) {
      return {
        ok: false,
        error: `Crédito-base inválido para cooperado ${cooperadoId}.`,
        code: "INVALID_VALUE",
      };
    }
    if (num < 0) {
      return { ok: false, error: "Crédito-base não pode ser negativo.", code: "NEGATIVE_VALUE" };
    }
    if (num > MAX_CREDITO_BASE_CENTS) {
      return {
        ok: false,
        error: "Crédito-base acima do limite permitido pelo servidor.",
        code: "VALUE_TOO_HIGH",
      };
    }
    sanitized[cooperadoId] = num;
  }

  return { ok: true, sanitized };
}

/** Detecta divergência entre prévia e confirmação enviadas pelo cliente. */
export function assertCreditosBaseConsistent(
  preview: Record<string, number>,
  confirm: Record<string, number>
): CreditosBaseValidation {
  const previewKeys = Object.keys(preview).sort();
  const confirmKeys = Object.keys(confirm).sort();
  if (previewKeys.join("|") !== confirmKeys.join("|")) {
    return {
      ok: false,
      error: "Contexto de crédito-base divergente entre prévia e confirmação.",
      code: "PREVIEW_MISMATCH",
    };
  }
  for (const key of previewKeys) {
    if (preview[key] !== confirm[key]) {
      return {
        ok: false,
        error: "Valor de crédito-base alterado entre prévia e confirmação.",
        code: "PREVIEW_VALUE_MISMATCH",
      };
    }
  }
  return { ok: true, sanitized: confirm };
}

/**
 * Impede crédito HB acima do valor a receber na nuvem (fonte autoritativa).
 * Valores do cliente acima do teto operacional são reduzidos; ausentes usam só a nuvem.
 * @deprecated Prefer {@link pickCreditosBaseForLimitSync} — sync de limite usa só a nuvem.
 */
export function clampCreditosBaseToAuthoritative(
  client: Record<string, number>,
  authoritative: Record<string, number>,
  cooperadoIds: string[]
): { sanitized: Record<string, number>; clamped: string[] } {
  const picked = pickCreditosBaseForLimitSync({ authoritative, cooperadoIds, clientPreview: client });
  return { sanitized: picked.creditosBaseCents, clamped: picked.inflatedByClient };
}

export type CreditBaseClientDivergence = {
  cooperadoId: string;
  clientCents: number;
  authoritativeCents: number;
  deltaCents: number;
};

/**
 * Fase 1 — limite HB: crédito-base vem exclusivamente do snapshot servidor (operacional + notas).
 * O mapa do cliente, se enviado, serve só para auditoria de divergência.
 */
export function pickCreditosBaseForLimitSync(opts: {
  authoritative: Record<string, number>;
  cooperadoIds: string[];
  clientPreview?: Record<string, number>;
}): {
  creditosBaseCents: Record<string, number>;
  inflatedByClient: string[];
  divergences: CreditBaseClientDivergence[];
} {
  const creditosBaseCents: Record<string, number> = {};
  const inflatedByClient: string[] = [];
  const divergences: CreditBaseClientDivergence[] = [];
  const preview = opts.clientPreview ?? {};

  for (const cooperadoId of opts.cooperadoIds) {
    const authoritativeCents = Math.max(0, Math.round(Number(opts.authoritative[cooperadoId] ?? 0)));
    creditosBaseCents[cooperadoId] = authoritativeCents;

    if (preview[cooperadoId] === undefined) continue;
    const clientCents = Math.max(0, Math.round(Number(preview[cooperadoId])));
    if (clientCents === authoritativeCents) continue;

    divergences.push({
      cooperadoId,
      clientCents,
      authoritativeCents,
      deltaCents: clientCents - authoritativeCents,
    });
    if (clientCents > authoritativeCents) {
      inflatedByClient.push(cooperadoId);
    }
  }

  return { creditosBaseCents, inflatedByClient, divergences };
}
