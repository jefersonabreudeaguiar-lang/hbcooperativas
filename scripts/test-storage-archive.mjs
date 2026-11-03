import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { exportStorageArchive, storageInventory, openStorageBytes, verifyStorageArchive } from "./lib/storage-archive.mjs";
import { wrapBackupKey } from "./lib/windows-backup-key.mjs";

const key = randomBytes(32);
const bytes = Buffer.from([0xff, 0xd8, 0x00, 0xfe, 0xff, 0xd9]);
function client({ drift = false, failure = false, traversal = false } = {}) {
  let inventories = 0;
  const items = Array.from({ length: 1101 }, (_, n) => ({ name: `${String(n).padStart(4, "0")}.jpg`,
    id: `id-${n}`, updated_at: "2026-11-02T12:00:00Z", metadata: { size: bytes.length } }));
  return { storage: {
    listBuckets: async () => { inventories++; return { data: [{ id: "private", name: "private", public: false }], error: null }; },
    from: () => ({
      list: async (prefix, { offset }) => ({ error: null, data: prefix
        ? items.slice(offset, offset + 17).map(i => ({ ...i, updated_at: drift && inventories > 1 ? "2026-11-02T13:00:00Z" : i.updated_at }))
        : offset ? [] : [{ name: traversal ? ".." : "folder", id: null, metadata: null }] }),
      download: async () => ({ data: failure ? null : new Blob([bytes]), error: null }),
    }),
  } };
}
const root = await mkdtemp(join(tmpdir(), "hb-storage-archive-"));
try {
  const legacy = spawnSync(process.execPath, ["scripts/backup-cloud.mjs"], { encoding: "utf8", timeout: 10000 });
  assert.equal(legacy.status, 1);
  assert.match(legacy.stderr, /não produz backup restaurável/);
  const output = join(root, "valid");
  const result = await exportStorageArchive(client(), output, key, "fixture");
  assert.equal(result.files, 1101, "Não pode cortar em mil arquivos nem presumir tamanho da página");
  assert.equal(result.bytes, 1101 * bytes.length);
  assert.equal(result.complete, true);
  const manifest = JSON.parse(openStorageBytes(await readFile(join(output, "manifest.hbenc")), key, "manifest"));
  const object = manifest.entries[0];
  const sealed = await readFile(join(output, "objects", object.file));
  assert.deepEqual(openStorageBytes(sealed, key, JSON.stringify([object.bucket, object.path])), bytes,
    "Imagem deve voltar byte por byte, incluindo bytes inválidos em UTF-8");
  assert.throws(() => openStorageBytes(sealed, randomBytes(32), JSON.stringify([object.bucket, object.path])));
  assert.throws(() => openStorageBytes(sealed, key, "outro-arquivo"));
  sealed[sealed.length - 1] ^= 1;
  await writeFile(join(output, "objects", object.file), sealed);
  await assert.rejects(verifyStorageArchive(output, key), "Alteração de um byte deve ser detectada");
  for (const options of [{ drift: true }, { failure: true }]) {
    const destination = join(root, options.drift ? "drift" : "failure");
    await assert.rejects(exportStorageArchive(client(options), destination, key, "fixture"));
    assert.equal(JSON.parse(await readFile(join(destination, "status.json"))).complete, false);
  }
  await assert.rejects(storageInventory(client({ traversal: true })));
  if (process.platform === "win32") assert.deepEqual(wrapBackupKey(wrapBackupKey(key), true), key);
  console.log("PASS: 1101 imagens binárias, paginação limitada pelo servidor, cifra autenticada, chave recuperável localmente e falha/alteração sem sucesso falso.");
} finally {
  key.fill(0);
  const target = resolve(root);
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("hb-storage-archive-")) throw Error("Diretório temporário inesperado; limpeza recusada.");
  await rm(target, { recursive: true, force: true });
}
