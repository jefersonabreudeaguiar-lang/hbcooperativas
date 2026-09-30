import type { FichaCorrida } from "@/types";

export type OperacionalFichaCorridaSlice = {
  fullReset?: boolean;
  pagamentosCooperado?: { fichaIds?: string[] }[];
  fichaCorrida?: FichaCorrida[];
};

export type FichaCorridaPreservacaoConflito = {
  fichaId: string;
  motivo: "conteudo_divergente" | "duplicata_inconsistente";
  occurredAt: string;
};

export type PreservarFichasReferenciadasResult<T extends OperacionalFichaCorridaSlice> = {
  payload: T;
  conflitos: FichaCorridaPreservacaoConflito[];
  /** IDs reintroduzidos da cloud porque o incoming omitiu. */
  fichasRestauradasDaCloud: string[];
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export function fichasCorridaEquivalentes(a: FichaCorrida, b: FichaCorrida): boolean {
  return stableStringify(a) === stableStringify(b);
}

type FichaIndex = {
  byId: Map<string, FichaCorrida>;
  duplicateConflictIds: Set<string>;
};

function indexFichaCorrida(list: FichaCorrida[] | undefined): FichaIndex {
  const byId = new Map<string, FichaCorrida>();
  const duplicateConflictIds = new Set<string>();
  for (const f of list ?? []) {
    const prev = byId.get(f.id);
    if (!prev) {
      byId.set(f.id, f);
      continue;
    }
    if (!fichasCorridaEquivalentes(prev, f)) {
      duplicateConflictIds.add(f.id);
    }
  }
  return { byId, duplicateConflictIds };
}

function collectProtectedFichaIds(existing: OperacionalFichaCorridaSlice | null | undefined): Set<string> {
  const ids = new Set<string>();
  for (const pg of existing?.pagamentosCooperado ?? []) {
    for (const fid of pg.fichaIds ?? []) {
      if (fid) ids.add(fid);
    }
  }
  return ids;
}

/**
 * Impede que um upload operacional (replace) remova objetos de fichaCorrida já
 * materializados na cloud quando referenciados por pagamentosCooperado[].fichaIds.
 * Não altera pagamentos nem reconstrói fichas inexistentes na cloud.
 */
export function preservarFichasReferenciadasPorPagamentos<
  T extends OperacionalFichaCorridaSlice,
>(
  existingOperacional: T | null | undefined,
  incomingOperacional: T
): PreservarFichasReferenciadasResult<T> {
  const empty: PreservarFichasReferenciadasResult<T> = {
    payload: incomingOperacional,
    conflitos: [],
    fichasRestauradasDaCloud: [],
  };

  if (!existingOperacional) return empty;
  if (incomingOperacional.fullReset === true) return empty;

  const protectedIds = collectProtectedFichaIds(existingOperacional);
  if (protectedIds.size === 0) return empty;

  const cloudIndex = indexFichaCorrida(existingOperacional.fichaCorrida);
  const incomingIndex = indexFichaCorrida(incomingOperacional.fichaCorrida);
  const conflitos: FichaCorridaPreservacaoConflito[] = [];
  const now = new Date().toISOString();

  const registerConflito = (fichaId: string, motivo: FichaCorridaPreservacaoConflito["motivo"]) => {
    if (conflitos.some((c) => c.fichaId === fichaId && c.motivo === motivo)) return;
    conflitos.push({ fichaId, motivo, occurredAt: now });
  };

  for (const id of cloudIndex.duplicateConflictIds) {
    registerConflito(id, "duplicata_inconsistente");
  }
  for (const id of incomingIndex.duplicateConflictIds) {
    registerConflito(id, "duplicata_inconsistente");
  }

  const merged = new Map<string, FichaCorrida>();
  const fichasRestauradasDaCloud: string[] = [];

  for (const [id, incomingFicha] of incomingIndex.byId) {
    const isProtected = protectedIds.has(id);
    const hasDuplicateConflict =
      cloudIndex.duplicateConflictIds.has(id) || incomingIndex.duplicateConflictIds.has(id);
    const cloudFicha = cloudIndex.byId.get(id);

    if (hasDuplicateConflict) {
      if (isProtected && cloudFicha) {
        merged.set(id, cloudFicha);
      }
      continue;
    }

    if (isProtected && cloudFicha && !fichasCorridaEquivalentes(incomingFicha, cloudFicha)) {
      registerConflito(id, "conteudo_divergente");
      merged.set(id, cloudFicha);
      continue;
    }

    merged.set(id, incomingFicha);
  }

  for (const id of protectedIds) {
    const cloudFicha = cloudIndex.byId.get(id);
    if (!cloudFicha) continue;
    if (merged.has(id)) continue;
    merged.set(id, cloudFicha);
    fichasRestauradasDaCloud.push(id);
  }

  const incomingOrder = (incomingOperacional.fichaCorrida ?? []).map((f) => f.id);
  const seen = new Set<string>();
  const fichaCorrida: FichaCorrida[] = [];

  for (const id of incomingOrder) {
    if (seen.has(id)) continue;
    const f = merged.get(id);
    if (!f) continue;
    fichaCorrida.push(f);
    seen.add(id);
  }
  for (const [id, f] of merged) {
    if (seen.has(id)) continue;
    fichaCorrida.push(f);
    seen.add(id);
  }

  return {
    payload: { ...incomingOperacional, fichaCorrida },
    conflitos,
    fichasRestauradasDaCloud,
  };
}

export function aplicarPreservacaoFichasReferenciadasPorPagamentosNoOperacional<
  T extends OperacionalFichaCorridaSlice,
>(
  existingOperacional: T | null | undefined,
  incomingOperacional: T
): PreservarFichasReferenciadasResult<T> {
  return preservarFichasReferenciadasPorPagamentos(existingOperacional, incomingOperacional);
}
