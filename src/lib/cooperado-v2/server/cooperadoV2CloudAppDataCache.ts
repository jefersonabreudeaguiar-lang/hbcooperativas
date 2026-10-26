import type { AppData } from "@/types";

type Built = { data: AppData; cooperativaId: string };

const TTL_MS = 45_000;

const cache = new Map<string, { at: number; value: Built }>();
const inflight = new Map<string, Promise<Built | null>>();

export function cooperadoV2CloudCacheKey(cnpj: string, scope: "inicio" | "full" = "full"): string {
  return scope === "inicio" ? `${cnpj}#inicio` : cnpj;
}

export function readCooperadoV2CloudAppDataCache(
  cnpj: string,
  scope: "inicio" | "full" = "full"
): Built | null {
  const hit = cache.get(cooperadoV2CloudCacheKey(cnpj, scope));
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(cooperadoV2CloudCacheKey(cnpj, scope));
    return null;
  }
  return hit.value;
}

export function writeCooperadoV2CloudAppDataCache(
  cnpj: string,
  value: Built,
  scope: "inicio" | "full" = "full"
): void {
  cache.set(cooperadoV2CloudCacheKey(cnpj, scope), { at: Date.now(), value });
}

export function invalidateCooperadoV2CloudAppDataCache(
  cnpj: string,
  scope?: "inicio" | "full"
): void {
  if (!scope) {
    cache.delete(cnpj);
    cache.delete(cooperadoV2CloudCacheKey(cnpj, "inicio"));
    inflight.delete(cnpj);
    inflight.delete(cooperadoV2CloudCacheKey(cnpj, "inicio"));
    return;
  }
  const key = cooperadoV2CloudCacheKey(cnpj, scope);
  cache.delete(key);
  inflight.delete(key);
}

export async function dedupeCooperadoV2CloudBuild(
  cnpj: string,
  build: () => Promise<Built | null>,
  scope: "inicio" | "full" = "full"
): Promise<Built | null> {
  const key = cooperadoV2CloudCacheKey(cnpj, scope);
  const cached = readCooperadoV2CloudAppDataCache(cnpj, scope);
  if (cached) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = build()
    .then((built) => {
      if (built) writeCooperadoV2CloudAppDataCache(cnpj, built, scope);
      return built;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}
