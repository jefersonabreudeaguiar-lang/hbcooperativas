/**
 * Estende fimEm da pauta aberta em +24h na nuvem.
 * Uso: node scripts/extend-pauta-votacao-cloud.mjs [cnpj] [pautaId]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  const k = t.slice(0, eq).trim();
  const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  if (!process.env[k]) process.env[k] = v;
}

const CNPJ = (process.argv[2] ?? "62351750000165").replace(/\D/g, "");
const PAUTA_ID = process.argv[3] ?? "vtp_1788452366259_lp4hv";

function addDaysIso(isoDate, days) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().split("T")[0];
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  realtime: { transport: ws },
});

const { data: blob, error: dlErr } = await sb.storage.from("hb-cooperativa-sync").download(`${CNPJ}/operacional.json`);
if (dlErr || !blob) {
  console.error("Erro ao baixar operacional:", dlErr?.message ?? "sem blob");
  process.exit(1);
}

const op = JSON.parse(await blob.text());
const pautas = op.votacaoPautas ?? [];
const idx = pautas.findIndex((p) => p.id === PAUTA_ID);
if (idx < 0) {
  console.error("Pauta não encontrada:", PAUTA_ID);
  process.exit(1);
}

const atual = pautas[idx];
const novoFim = addDaysIso(atual.fimEm, 1);
const now = new Date().toISOString();
pautas[idx] = { ...atual, fimEm: novoFim, updatedAt: now };
op.votacaoPautas = pautas;
op.updatedAt = now;

const body = JSON.stringify(op);
const { error: upErr } = await sb.storage.from("hb-cooperativa-sync").upload(`${CNPJ}/operacional.json`, body, {
  contentType: "application/json",
  upsert: true,
});
if (upErr) {
  console.error("Erro ao publicar:", upErr.message);
  process.exit(1);
}

console.log("OK — prazo estendido +24h");
console.log(JSON.stringify({ id: PAUTA_ID, fimEm: novoFim, status: atual.status }));
