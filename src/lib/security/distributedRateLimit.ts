/**
 * Rate limit distribuído opcional (Upstash Redis REST).
 * Sem credenciais → retorna null e o caller usa fallback in-memory.
 */

type LimitResult = { allowed: boolean };

async function upstashPipeline(
  commands: Array<[string, ...string[]]>
): Promise<unknown[] | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;

  try {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(commands),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Array<{ result?: unknown }>;
    return json.map((item) => item.result);
  } catch {
    return null;
  }
}

export async function distributedRateLimitCheck(
  key: string,
  max: number,
  windowSeconds: number
): Promise<LimitResult | null> {
  const results = await upstashPipeline([
    ["INCR", key],
    ["TTL", key],
  ]);
  if (!results || results.length < 2) return null;

  const count = Number(results[0]);
  let ttl = Number(results[1]);
  if (!Number.isFinite(count)) return null;

  if (ttl < 0) {
    await upstashPipeline([["EXPIRE", key, String(windowSeconds)]]);
    ttl = windowSeconds;
  }

  return { allowed: count <= max };
}

export function isDistributedRateLimitConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.UPSTASH_REDIS_REST_URL?.trim() && env.UPSTASH_REDIS_REST_TOKEN?.trim());
}
