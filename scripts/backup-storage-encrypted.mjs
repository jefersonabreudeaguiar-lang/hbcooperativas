/** Exportação cifrada de Storage. Não é um dump do banco nem um backup portátil. */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseEnv } from "node:util";
import { exportStorageArchive } from "./lib/storage-archive.mjs";
import { wrapBackupKey } from "./lib/windows-backup-key.mjs";

const argument = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const projectRef = argument("project-ref");
const envFile = argument("env-file");
if (!/^[a-z]{20}$/.test(projectRef ?? "") || !envFile) throw Error("Informe --project-ref e --env-file explicitamente.");
const env = parseEnv(await readFile(resolve(envFile), "utf8"));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
if (new URL(url).hostname !== `${projectRef}.supabase.co` || !env.SUPABASE_SERVICE_ROLE_KEY) throw Error("Projeto ou credencial não confere com o destino informado.");
const key = randomBytes(32);
try {
  const wrapped = wrapBackupKey(key);
  const recovered = wrapBackupKey(wrapped, true);
  if (!recovered.equals(key)) throw Error("Recuperação local da chave falhou.");
  recovered.fill(0);
  const output = join(process.cwd(), "backups", projectRef, `storage-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(4).toString("hex")}`);
  await mkdir(output, { recursive: true });
  await writeFile(join(output, "recovery.dpapi"), wrapped, { flag: "wx", mode: 0o600 });
  const client = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30000) }) },
  });
  console.log("Inventariando todos os arquivos; nenhuma alteração será feita na nuvem.");
  const summary = await exportStorageArchive(client, output, key, projectRef, { onProgress: progress => {
    console.log(progress.stage === "download" ? `Arquivos copiados: ${progress.completed}/${progress.total}` : `Páginas de inventário conferidas: ${progress.pages}`);
  } });
  console.log(JSON.stringify({ ...summary, output, keyRecovery: "same-windows-user-and-machine-only" }, null, 2));
} finally {
  key.fill(0);
}
