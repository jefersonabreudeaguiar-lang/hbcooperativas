import type { AppData } from "@/types";

type Built = { data: AppData; cooperativaId: string };

const TTL_MS = 45_000;

const cache = new Map<string, { at: number; value: Built }>();
const inflight = new Map<string, Promise<Built | null>>();

export function jefersonRebuildCloudCacheKey(cnpj: string, scope: "inicio" | "full" = "full"): string {
  return scope === "inicio" ? `${cnpj}#inicio` : cnpj;
}

export function readJefersonRebuildCloudCache(
  cnpj: string,
  scope: "inicio" | "full" = "full"
): Built | null {
  const hit = cache.get(jefersonRebuildCloudCacheKey(cnpj, scope));
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(jefersonRebuildCloudCacheKey(cnpj, scope));
    return null;
  }
  return hit.value;
}

export function writeJefersonRebuildCloudCache(
  cnpj: string,
  value: Built,
  scope: "inicio" | "full" = "full"
): void {
  cache.set(jefersonRebuildCloudCacheKey(cnpj, scope), { at: Date.now(), value });
}

export function invalidateJefersonRebuildCloudCache(cnpj: string, scope?: "inicio" | "full"): void {
  if (!scope) {
    cache.delete(cnpj);
    cache.delete(jefersonRebuildCloudCacheKey(cnpj, "inicio"));
    inflight.delete(cnpj);
    inflight.delete(jefersonRebuildCloudCacheKey(cnpj, "inicio"));
    return;
  }
  const key = jefersonRebuildCloudCacheKey(cnpj, scope);
  cache.delete(key);
  inflight.delete(key);
}

export async function dedupeJefersonRebuildCloudBuild(
  cnpj: string,
  build: () => Promise<Built | null>,
  scope: "inicio" | "full" = "full"
): Promise<Built | null> {
  const key = jefersonRebuildCloudCacheKey(cnpj, scope);
  const cached = readJefersonRebuildCloudCache(cnpj, scope);
  if (cached) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = build()
    .then((built) => {
      if (built) writeJefersonRebuildCloudCache(cnpj, built, scope);
      return built;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}
