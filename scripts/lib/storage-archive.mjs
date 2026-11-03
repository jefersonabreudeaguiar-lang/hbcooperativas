import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const magic = Buffer.from("HBST1");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
export function sealStorageBytes(bytes, key, context) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw Error("Chave de arquivo inválida.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([magic, iv, cipher.getAuthTag(), body]);
}
export function openStorageBytes(bytes, key, context) {
  if (bytes.length < 33 || !bytes.subarray(0, 5).equals(magic)) throw Error("Formato de arquivo inválido.");
  const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(5, 17));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(bytes.subarray(17, 33));
  return Buffer.concat([decipher.update(bytes.subarray(33)), decipher.final()]);
}

/** Continua até uma página vazia, inclusive se o servidor limitar páginas menores. */
export async function storageInventory(client, onProgress) {
  const { data: buckets, error } = await client.storage.listBuckets();
  if (error || !Array.isArray(buckets)) throw Error("Não foi possível listar todos os buckets.");
  const objects = [];
  const seen = new Set();
  let pages = 0;
  for (const bucket of buckets) {
    if (typeof bucket.id !== "string" || !bucket.id) throw Error("Bucket inválido.");
    const pending = [""];
    while (pending.length) {
      const batch = pending.splice(0, 4);
      await Promise.all(batch.map(async prefix => {
      let offset = 0;
      for (;;) {
        const page = await client.storage.from(bucket.id).list(prefix, { limit: 500, offset, sortBy: { column: "name", order: "asc" } });
        pages++;
        if (pages % 100 === 0) onProgress?.({ stage: "inventory", pages });
        if (page.error || !Array.isArray(page.data)) throw Error("Falha ao listar arquivos; cópia incompleta.");
        if (!page.data.length) break;
        for (const row of page.data) {
          if (typeof row.name !== "string" || !row.name || /[\\/]/.test(row.name) || row.name === "." || row.name === "..") throw Error("Nome de objeto inválido.");
          const path = prefix ? `${prefix}/${row.name}` : row.name;
          const folder = row.id == null && row.metadata == null;
          const identity = JSON.stringify([bucket.id, path, folder]);
          if (seen.has(identity)) throw Error("Listagem repetida ou alterada durante a cópia.");
          seen.add(identity);
          if (folder) { pending.push(path); continue; }
          if (typeof row.id !== "string" || !row.id || typeof row.updated_at !== "string") throw Error("Versão de objeto ausente.");
          const size = row.metadata?.size == null ? null : Number(row.metadata.size);
          if (size !== null && (!Number.isSafeInteger(size) || size < 0)) throw Error("Tamanho de objeto inválido.");
          objects.push({ bucket: bucket.id, path, id: row.id, updatedAt: row.updated_at, size });
        }
        offset += page.data.length;
      }
      }));
    }
  }
  objects.sort((a, b) => JSON.stringify([a.bucket, a.path]).localeCompare(JSON.stringify([b.bucket, b.path])));
  return { buckets: buckets.map(b => ({ id: b.id, name: b.name, public: b.public,
    fileSizeLimit: b.file_size_limit, allowedMimeTypes: b.allowed_mime_types })).sort((a, b) => a.id.localeCompare(b.id)), objects };
}

export async function exportStorageArchive(client, output, key, projectRef, options = {}) {
  const before = await storageInventory(client, options.onProgress);
  await mkdir(join(output, "objects"), { recursive: true });
  await writeFile(join(output, "status.json"), JSON.stringify({ version: 1, complete: false, projectRef }), { flag: "wx", mode: 0o600 });
  const entries = new Array(before.objects.length);
  let bytesTotal = 0;
  let cursor = 0;
  let completed = 0;
  let failure;
  async function worker() {
  while (!failure && cursor < before.objects.length) {
    const index = cursor++;
    const object = before.objects[index];
    try {
    const { data, error } = await client.storage.from(object.bucket).download(object.path);
    if (error || !data) throw Error("Falha ao baixar arquivo; cópia incompleta.");
    const bytes = Buffer.from(await data.arrayBuffer());
    if (object.size !== null && object.size !== bytes.length) throw Error("Arquivo alterado ou truncado durante o download.");
    const context = JSON.stringify([object.bucket, object.path]);
    const file = hash(context) + ".hbenc";
    await writeFile(join(output, "objects", file), sealStorageBytes(bytes, key, context), { flag: "wx", mode: 0o600 });
    entries[index] = { ...object, file, bytes: bytes.length, sha256: hash(bytes) };
    bytesTotal += bytes.length;
    completed++;
    if (completed % 100 === 0 || completed === before.objects.length) options.onProgress?.({ stage: "download", completed, total: before.objects.length });
    } catch (error) { failure = error; }
  }
  }
  await Promise.all(Array.from({ length: 4 }, () => worker()));
  if (failure) throw failure;
  const after = await storageInventory(client, options.onProgress);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw Error("O Storage mudou durante a cópia; repita para obter inventário estável.");
  const manifest = { version: 1, purpose: "storage-only-encrypted-export", projectRef,
    createdAt: new Date().toISOString(), inventoryStable: true, databaseIncluded: false,
    consistentDatabaseSnapshot: false, cloudRestoreVerified: false, buckets: before.buckets, entries };
  await writeFile(join(output, "manifest.hbenc"), sealStorageBytes(Buffer.from(JSON.stringify(manifest)), key, "manifest"), { flag: "wx", mode: 0o600 });
  const verified = await verifyStorageArchive(output, key);
  const summary = { version: 1, projectRef, complete: true, files: entries.length, bytes: bytesTotal,
    encrypted: true, localDecryptVerified: true, cloudRestoreVerified: false, databaseIncluded: false, createdAt: manifest.createdAt };
  if (verified.files !== summary.files || verified.bytes !== summary.bytes) throw Error("Verificação incompleta.");
  await writeFile(join(output, "status.json"), JSON.stringify(summary, null, 2), { mode: 0o600 });
  return summary;
}

export async function verifyStorageArchive(output, key) {
  const manifest = JSON.parse(openStorageBytes(await readFile(join(output, "manifest.hbenc")), key, "manifest").toString("utf8"));
  if (manifest.version !== 1 || !Array.isArray(manifest.entries)) throw Error("Manifesto inválido.");
  let bytesTotal = 0;
  const files = new Set();
  for (const entry of manifest.entries) {
    if (!/^[a-f0-9]{64}\.hbenc$/.test(entry.file) || files.has(entry.file)) throw Error("Arquivo do manifesto inválido.");
    files.add(entry.file);
    const bytes = openStorageBytes(await readFile(join(output, "objects", entry.file)), key, JSON.stringify([entry.bucket, entry.path]));
    if (bytes.length !== entry.bytes || hash(bytes) !== entry.sha256) throw Error("Integridade do arquivo divergente.");
    bytesTotal += bytes.length;
  }
  return { files: files.size, bytes: bytesTotal };
}
