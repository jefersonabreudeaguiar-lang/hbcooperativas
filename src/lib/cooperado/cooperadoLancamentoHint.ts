import { secureApiFetch } from "@/lib/security/clientSession";
import { normalizeCnpj } from "@/utils/cooperativa";

export function cooperadoIdsAfetadosPelaNota(nota: {
  cooperadoId?: string | null;
  divisaoEntrega?: { participantes?: { cooperadoId?: string | null }[] } | null;
}): string[] {
  const ids = new Set<string>();
  const dono = (nota.cooperadoId ?? "").trim();
  if (dono) ids.add(dono);
  for (const parte of nota.divisaoEntrega?.participantes ?? []) {
    const id = (parte.cooperadoId ?? "").trim();
    if (id) ids.add(id);
  }
  return [...ids];
}

export type CooperadoLancamentoHint = {
  at: string;
  notaId: string;
};

const inflightPublish = new Map<string, Promise<boolean>>();

export async function publishCooperadoLancamentoHint(opts: {
  cnpj: string;
  cooperadoIds: string[];
  notaId: string;
}): Promise<boolean> {
  const digits = normalizeCnpj(opts.cnpj);
  const notaId = opts.notaId.trim();
  const cooperadoIds = [...new Set(opts.cooperadoIds.map((id) => id.trim()).filter(Boolean))];
  if (digits.length !== 14 || !notaId || cooperadoIds.length === 0) return false;

  const key = `${digits}|${notaId}|${cooperadoIds.slice().sort().join(",")}`;
  const existing = inflightPublish.get(key);
  if (existing) return existing;

  const run = (async () => {
    try {
      const res = await secureApiFetch("/api/cooperado/lancamento-hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cnpj: digits, cooperadoIds, notaId }),
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      inflightPublish.delete(key);
    }
  })();

  inflightPublish.set(key, run);
  return run;
}

export async function fetchMyCooperadoLancamentoHint(opts: {
  cnpj: string;
  cooperadoId: string;
}): Promise<CooperadoLancamentoHint | null> {
  const digits = normalizeCnpj(opts.cnpj);
  const cooperadoId = opts.cooperadoId.trim();
  if (digits.length !== 14 || !cooperadoId) return null;
  try {
    const res = await secureApiFetch(
      `/api/cooperado/lancamento-hint?cnpj=${digits}&cooperadoId=${encodeURIComponent(cooperadoId)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { at?: string | null; notaId?: string | null };
    if (!json.at || !json.notaId) return null;
    return { at: json.at, notaId: json.notaId };
  } catch {
    return null;
  }
}
