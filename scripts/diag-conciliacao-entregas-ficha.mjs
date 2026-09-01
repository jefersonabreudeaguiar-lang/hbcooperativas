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

const CNPJ = process.argv[2] ?? "62351750000165";
const MES = process.argv[3] ?? "2026-08";

function round2(v) {
  return Math.round(v * 100) / 100;
}
function sum(arr, fn) {
  return round2(arr.reduce((s, x) => s + fn(x), 0));
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  realtime: { transport: ws },
});

console.log("Carregando dados da nuvem...");
const { data: notaFiles } = await sb.storage.from("hb-entregas").list(CNPJ, { limit: 2000 });
const notas = [];
for (const f of notaFiles ?? []) {
  if (!f.name.endsWith(".json")) continue;
  const { data: blob } = await sb.storage.from("hb-entregas").download(`${CNPJ}/${f.name}`);
  if (!blob) continue;
  try {
    notas.push(JSON.parse(await blob.text()));
  } catch {
    /* skip */
  }
}

const { data: opBlob, error: opErr } = await sb.storage
  .from("hb-cooperativa-sync")
  .download(`${CNPJ}/operacional.json`);
if (opErr || !opBlob) {
  console.error("operacional.json:", opErr?.message ?? "ausente");
  process.exit(1);
}
const operacional = JSON.parse(await opBlob.text());
const fichas = operacional.fichaCorrida ?? [];

const notasMes = notas.filter(
  (n) => n.mesReferencia === MES && (n.status === "conferida" || n.status === "pago")
);
const fichasMes = fichas.filter((f) => f.mesReferencia === MES);
const totalNotas = sum(notasMes, (n) => n.valorBruto ?? 0);
const totalFicha = sum(fichasMes, (f) => f.valorBruto ?? 0);
const fichaNotaIds = new Set(fichasMes.map((f) => f.notaPedidoId));
const semFicha = notasMes.filter((n) => !fichaNotaIds.has(n.id));

console.log(`\nMês: ${MES}`);
console.log(`Notas conferidas/pagas: ${notasMes.length} → R$ ${totalNotas.toFixed(2)}`);
console.log(`Ficha corrida (bruto): ${fichasMes.length} → R$ ${totalFicha.toFixed(2)}`);
console.log(`Diferença: R$ ${round2(totalNotas - totalFicha).toFixed(2)}`);
console.log(`Notas sem ficha: ${semFicha.length}`);
for (const n of semFicha) {
  console.log(
    `  • ${n.cooperadoNomeSnapshot ?? n.cooperadoId} — R$ ${(n.valorBruto ?? 0).toFixed(2)} (${n.id})`
  );
}

const notaIds = new Set(notasMes.map((n) => n.id));
const fichaExtra = fichasMes.filter((f) => !notaIds.has(f.notaPedidoId));
console.log(`Fichas sem nota conferida no mês: ${fichaExtra.length}`);
for (const f of fichaExtra) {
  const notaRef = notas.find((n) => n.id === f.notaPedidoId);
  console.log(
    `  • ${f.cooperadoNome ?? f.cooperadoId} — R$ ${(f.valorBruto ?? 0).toFixed(2)} | nota ${f.notaPedidoId} status=${notaRef?.status ?? "ausente"} mes=${notaRef?.mesReferencia ?? "?"}`
  );
}

const brutoMismatch = notasMes
  .map((n) => {
    const f = fichasMes.find((x) => x.notaPedidoId === n.id);
    if (!f) return null;
    const diff = round2((n.valorBruto ?? 0) - (f.valorBruto ?? 0));
    if (Math.abs(diff) <= 0.02) return null;
    return { nome: n.cooperadoNomeSnapshot ?? n.cooperadoId, nota: n.valorBruto, ficha: f.valorBruto, diff };
  })
  .filter(Boolean);
if (brutoMismatch.length) {
  console.log(`\nNotas com ficha mas valor bruto diferente: ${brutoMismatch.length}`);
  for (const row of brutoMismatch) {
    console.log(
      `  • ${row.nome}: nota R$ ${row.nota.toFixed(2)} vs ficha R$ ${row.ficha.toFixed(2)} (Δ R$ ${row.diff.toFixed(2)})`
    );
  }
}
