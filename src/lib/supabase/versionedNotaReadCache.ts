import type { NotaPedido } from "@/types";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ENTRIES = 512;
const TTL = 120_000;
const entries = new Map<string, { value: NotaPedido; bytes: number; expires: number }>();
let bytes = 0;

/** Só reutiliza conteúdo depois que uma listagem atual confirmou o eTag do objeto. */
export async function readVersionedNota(
  path: string, etag: string | undefined, read: () => Promise<NotaPedido>,
): Promise<NotaPedido> {
  if (!etag) return read();
  const key = `${path}:${etag}`;
  const cached = entries.get(key);
  if (cached && cached.expires > Date.now()) return structuredClone(cached.value);
  const value = await read();
  const size = new TextEncoder().encode(JSON.stringify(value)).length;
  if (size > MAX_BYTES) return value;
  for (const [id, entry] of entries) {
    if (entry.expires <= Date.now() || id === key) { entries.delete(id); bytes -= entry.bytes; }
  }
  while (entries.size >= MAX_ENTRIES || bytes + size > MAX_BYTES) {
    const first = entries.entries().next().value;
    if (!first) break;
    entries.delete(first[0]); bytes -= first[1].bytes;
  }
  entries.set(key, { value: structuredClone(value), bytes: size, expires: Date.now() + TTL });
  bytes += size;
  return value;
}
