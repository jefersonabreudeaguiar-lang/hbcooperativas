import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { wrapBackupKey } from "./lib/windows-backup-key.mjs";
import { verifyStorageArchive } from "./lib/storage-archive.mjs";

const path = process.argv.find(a => a.startsWith("--path="))?.slice(7);
if (!path) throw Error("Informe --path para uma cópia cifrada existente.");
const directory = resolve(path);
const status = JSON.parse(await readFile(join(directory, "status.json"), "utf8"));
if (status.complete !== true || status.encrypted !== true) throw Error("Cópia incompleta ou sem cifra; verificação recusada.");
const key = wrapBackupKey(await readFile(join(directory, "recovery.dpapi")), true);
try {
  const result = await verifyStorageArchive(directory, key);
  if (result.files !== status.files || result.bytes !== status.bytes) throw Error("Contagem ou tamanho total diverge do manifesto.");
  console.log(JSON.stringify({ ...result, projectRef: status.projectRef, localDecryptVerified: true,
    cloudRestoreVerified: false, keyRecovery: "same-windows-user-and-machine-only" }));
} finally { key.fill(0); }
