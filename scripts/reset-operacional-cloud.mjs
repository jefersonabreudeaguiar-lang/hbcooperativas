import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
});

const ENTREGAS_BUCKET = "hb-entregas";
const SYNC_BUCKET = "hb-cooperativa-sync";

function normalizeCnpj(value) {
  return String(value ?? "").replace(/\D/g, "");
}

async function listStoragePrefixes(bucket) {
  const { data, error } = await supabase.storage.from(bucket).list("", { limit: 500 });
  if (error || !data?.length) return [];
  return data.map((f) => normalizeCnpj(f.name)).filter((c) => c.length === 14);
}

async function listCnpjs() {
  const { data } = await supabase.from("cooperativas").select("cnpj");
  const fromDb = (data ?? [])
    .map((row) => normalizeCnpj(row.cnpj))
    .filter((c) => c.length === 14);
  const [entregas, sync] = await Promise.all([
    listStoragePrefixes(ENTREGAS_BUCKET),
    listStoragePrefixes(SYNC_BUCKET),
  ]);
  return [...new Set([...fromDb, ...entregas, ...sync])];
}

async function removeNotaFotoParts(cnpj, notaId) {
  const folder = `${cnpj}/${notaId}`;
  const { data: files } = await supabase.storage.from(ENTREGAS_BUCKET).list(folder, { limit: 500 });
  if (!files?.length) return;
  const paths = files.map((f) => `${folder}/${f.name}`);
  await supabase.storage.from(ENTREGAS_BUCKET).remove(paths);
}

async function deleteAllNotas(cnpj) {
  let removed = 0;
  const { data: files } = await supabase.storage.from(ENTREGAS_BUCKET).list(cnpj, { limit: 1000 });
  if (files?.length) {
    for (const file of files) {
      if (file.name.endsWith(".json")) {
        const notaId = file.name.replace(/\.json$/, "");
        await removeNotaFotoParts(cnpj, notaId);
      }
    }
    const paths = files
      .filter((f) => f.name.endsWith(".json"))
      .map((f) => `${cnpj}/${f.name}`);
    if (paths.length) {
      const { error } = await supabase.storage.from(ENTREGAS_BUCKET).remove(paths);
      if (!error) removed += paths.length;
    }
  }

  const { error, count } = await supabase
    .from("notas_pedido")
    .delete({ count: "exact" })
    .eq("cooperativa_cnpj", cnpj);

  if (!error) removed += count ?? 0;
  return removed;
}

async function resetOperacional(cnpj) {
  const path = `${cnpj}/operacional.json`;
  let existing = null;
  const { data: blob } = await supabase.storage.from(SYNC_BUCKET).download(path);
  if (blob) {
    try {
      existing = JSON.parse(await blob.text());
    } catch {
      existing = null;
    }
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    operationalResetVersion: 6,
    fullReset: true,
    wipeNotas: true,
    arquivosMensais: [],
    ajustesFichaMes: [],
    pagamentosCooperado: [],
    comunicados: [],
    mensalidades: existing?.mensalidades ?? [],
    descontos: [],
    valoresAvulsosReceber: [],
    livroCaixa: [],
    prestacoesContas: [],
    prestacoesContasExcluidas: [],
    config: existing?.config ?? { descontoPadraoCooperativa: 5 },
  };

  const { error } = await supabase.storage.from(SYNC_BUCKET).upload(path, JSON.stringify(payload), {
    contentType: "application/json",
    upsert: true,
  });
  if (error) throw new Error(error.message);
}

const cnpjs = await listCnpjs();
if (cnpjs.length === 0) {
  console.log("Nenhuma cooperativa encontrada na nuvem.");
  process.exit(0);
}

for (const cnpj of cnpjs) {
  const notas = await deleteAllNotas(cnpj);
  await resetOperacional(cnpj);
  console.log(`CNPJ ${cnpj}: ${notas} entrega(s) removida(s), operacional zerado.`);
}

console.log("Limpeza na nuvem concluída.");
