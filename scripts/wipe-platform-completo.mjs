/**
 * Zera TODA a plataforma na nuvem para recomeçar do zero:
 * - entregas/notas/fotos
 * - operacional (mensalidades, pagamentos, comunicados, ficha, livro caixa)
 * - cadastros cooperado na nuvem
 * - contas cooperado (app_users)
 * - config de mensalidade da cooperativa (evita recriação automática)
 */
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
const COOPERADOS_BUCKET = "hb-cooperados";
const OPERATIONAL_RESET_VERSION = 9;

const MENSALIDADE_CONFIG_ZERADA = {
  valorPadrao: 0,
  diaVencimento: 10,
  diaLembrete: 9,
  gerarAutomaticamente: false,
  mesesCobranca: [],
  lembreteAtivo: false,
};

function normalizeCnpj(value) {
  return String(value ?? "").replace(/\D/g, "");
}

async function listStoragePrefixes(bucket) {
  const { data, error } = await supabase.storage.from(bucket).list("", { limit: 500 });
  if (error || !data?.length) return [];
  return data.map((f) => normalizeCnpj(f.name)).filter((c) => c.length === 14);
}

async function listCnpjs() {
  const { data } = await supabase.from("cooperativas").select("cnpj, id");
  const fromDb = (data ?? [])
    .map((row) => normalizeCnpj(row.cnpj))
    .filter((c) => c.length === 14);
  const [entregas, sync, cooperados] = await Promise.all([
    listStoragePrefixes(ENTREGAS_BUCKET),
    listStoragePrefixes(SYNC_BUCKET),
    listStoragePrefixes(COOPERADOS_BUCKET),
  ]);
  return [...new Set([...fromDb, ...entregas, ...sync, ...cooperados])];
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
    operationalResetVersion: OPERATIONAL_RESET_VERSION,
    fullReset: true,
    wipeNotas: true,
    arquivosMensais: [],
    ajustesFichaMes: [],
    pagamentosCooperado: [],
    comunicados: [],
    mensalidades: [],
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

async function resetContratosIfExists(cnpj) {
  const path = `${cnpj}/contratos.json`;
  const { data: blob } = await supabase.storage.from(SYNC_BUCKET).download(path);
  if (!blob) return;
  let existing = null;
  try {
    existing = JSON.parse(await blob.text());
  } catch {
    return;
  }
  const payload = {
    updatedAt: new Date().toISOString(),
    instituicoes: existing?.instituicoes ?? [],
    produtosInstituicao: existing?.produtosInstituicao ?? [],
    instituicoesExcluidas: existing?.instituicoesExcluidas ?? [],
    cronogramasContrato: existing?.cronogramasContrato ?? [],
  };
  await supabase.storage.from(SYNC_BUCKET).upload(path, JSON.stringify(payload), {
    contentType: "application/json",
    upsert: true,
  });
}

async function zerarMensalidadeConfigCooperativa(cnpj) {
  const digits = normalizeCnpj(cnpj);
  const { error } = await supabase
    .from("cooperativas")
    .update({ mensalidade_config: MENSALIDADE_CONFIG_ZERADA, updated_at: new Date().toISOString() })
    .eq("cnpj", digits);
  if (error) {
    console.warn(`Aviso: mensalidade_config não zerada para ${digits}:`, error.message);
  }
}

async function deleteAllCooperadosStorage(cnpj) {
  const { data: files } = await supabase.storage.from(COOPERADOS_BUCKET).list(cnpj, { limit: 500 });
  if (!files?.length) return 0;
  const paths = files.filter((f) => f.name.endsWith(".json")).map((f) => `${cnpj}/${f.name}`);
  if (!paths.length) return 0;
  const { error } = await supabase.storage.from(COOPERADOS_BUCKET).remove(paths);
  if (error) throw new Error(error.message);
  return paths.length;
}

async function deleteCooperadoAppUsers(cnpj) {
  const { error, count } = await supabase
    .from("app_users")
    .delete({ count: "exact" })
    .eq("role", "cooperado")
    .eq("cooperativa_cnpj", cnpj);
  if (error) {
    const msg = error.message ?? "";
    if (error.code === "42P01" || /app_users/i.test(msg) || /schema cache/i.test(msg)) return 0;
    throw new Error(error.message);
  }
  return count ?? 0;
}

const cnpjs = await listCnpjs();
if (cnpjs.length === 0) {
  console.log("Nenhuma cooperativa encontrada na nuvem.");
  process.exit(0);
}

let totalNotas = 0;
let totalCooperados = 0;
let totalUsers = 0;

for (const cnpj of cnpjs) {
  const notas = await deleteAllNotas(cnpj);
  await resetOperacional(cnpj);
  await resetContratosIfExists(cnpj);
  await zerarMensalidadeConfigCooperativa(cnpj);
  const cooperados = await deleteAllCooperadosStorage(cnpj);
  const users = await deleteCooperadoAppUsers(cnpj);
  totalNotas += notas;
  totalCooperados += cooperados;
  totalUsers += users;
  console.log(
    `CNPJ ${cnpj}: ${notas} entrega(s), operacional+mensalidades zerados, ${cooperados} cadastro(s), ${users} conta(s).`
  );
}

console.log(
  `Plataforma zerada (v${OPERATIONAL_RESET_VERSION}) — ${totalNotas} entrega(s), ${totalCooperados} cooperado(s), ${totalUsers} conta(s).`
);
