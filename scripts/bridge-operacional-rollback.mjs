import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const TEST_URL = "https://ocyfzramxvxqbtkorubn.supabase.co";
const TEST_CNPJ = "99999999999996";
const MAX_BYTES = 50 * 1024 * 1024;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function readLegacy(bucket, path) {
  const name = "operacional.json";
  const listed = await bucket.list(TEST_CNPJ, { search: name });
  if (listed.error || !listed.data) throw new Error("Não foi possível verificar o inventário do Storage.");
  if (!listed.data.some((entry) => entry.name === name)) return "absent";
  const { data, error } = await bucket.download(path, {}, { cache: "no-store" });
  if (error || !data) throw new Error("Não foi possível verificar o arquivo operacional legado.");
  return hash(Buffer.from(await data.arrayBuffer()));
}

/** Run only after stopping legacy writers for the reserved test cooperative. */
export async function bridgeFrozenOperacional(supabase, revision, expectedLegacyHash) {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(revision ?? "")) {
    throw new Error("Informe o identificador da revisão congelada.");
  }
  const { data, error } = await supabase.from("hb_operacional_snapshots")
    .select("revision,payload,writes_frozen")
    .eq("cooperativa_cnpj", TEST_CNPJ).maybeSingle();
  if (error || !data?.writes_frozen || data.revision !== revision) {
    throw new Error("A revisão solicitada não é a última revisão congelada.");
  }
  if (!data.payload || typeof data.payload !== "object" || Array.isArray(data.payload)) {
    throw new Error("A revisão congelada não contém um objeto operacional.");
  }
  const bytes = Buffer.from(JSON.stringify(data.payload));
  if (bytes.length > MAX_BYTES) throw new Error("A revisão excede o limite do arquivo legado.");
  const targetHash = hash(bytes);
  const bucket = supabase.storage.from("hb-cooperativa-sync");
  const path = `${TEST_CNPJ}/operacional.json`;
  const beforeHash = await readLegacy(bucket, path);
  if (expectedLegacyHash === undefined) return { revision, beforeHash, targetHash, applied: false };
  if (beforeHash !== expectedLegacyHash) throw new Error("O arquivo legado mudou desde a conferência.");
  if (beforeHash !== targetHash) {
    const write = await bucket.upload(path, bytes, {
      contentType: "application/json",
      cacheControl: "0",
      upsert: beforeHash !== "absent",
    });
    if (write.error) throw new Error("A cópia para o arquivo legado falhou. Confira o destino.");
  }
  if (await readLegacy(bucket, path) !== targetHash) {
    throw new Error("A releitura do arquivo legado diverge. Interrompa o retorno.");
  }
  return { revision, beforeHash, targetHash, applied: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , revision, expectedLegacyHash] = process.argv;
  const key = process.env.HB_ROLLBACK_HOMOLOG_SERVICE_KEY;
  if (!key) throw new Error("Configure apenas a chave administrativa de homologação para este ensaio.");
  const client = createClient(TEST_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  console.log(JSON.stringify(await bridgeFrozenOperacional(client, revision, expectedLegacyHash)));
}
