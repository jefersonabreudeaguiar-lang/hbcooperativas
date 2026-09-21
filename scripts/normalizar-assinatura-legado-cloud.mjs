/**
 * Marca assinatura legado (só foto) como confirmada na nuvem — Julio, Jeferson, etc.
 * node scripts/normalizar-assinatura-legado-cloud.mjs
 * node scripts/normalizar-assinatura-legado-cloud.mjs --dry-run
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";

const DRY = process.argv.includes("--dry-run");

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  const k = t.slice(0, eq).trim();
  const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  if (!process.env[k]) process.env[k] = v;
}

const CNPJ = "62351750000165";

function precisaNormalizar(c) {
  const url = c.assinaturaCadastroDataUrl?.trim();
  if (!url) return false;
  if (c.assinaturaCadastroStatus === "em_analise" || c.assinaturaCadastroStatus === "devolvida") return false;
  if (c.assinaturaCadastroStatus === "confirmada" && c.assinaturaConfirmadaEm) return false;
  return true;
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  realtime: { transport: ws },
});

const { data: files } = await sb.storage.from("hb-cooperados").list(CNPJ, { limit: 500 });
let n = 0;

for (const f of files ?? []) {
  if (!f.name.endsWith(".json")) continue;
  const path = `${CNPJ}/${f.name}`;
  const { data: blob } = await sb.storage.from("hb-cooperados").download(path);
  if (!blob) continue;
  const parsed = JSON.parse(await blob.text());
  const c = parsed.cooperado;
  if (!c?.id || !precisaNormalizar(c)) continue;

  const confirmadaEm = c.assinaturaConfirmadaEm ?? c.assinaturaCadastradaEm ?? c.updatedAt;
  c.assinaturaCadastroStatus = "confirmada";
  c.assinaturaConfirmadaEm = confirmadaEm;
  c.assinaturaConfirmadaPorNome = c.assinaturaConfirmadaPorNome ?? "Sistema (legado)";
  c.updatedAt = new Date().toISOString();
  parsed.cooperado = c;

  console.log(DRY ? "[dry-run]" : "OK", c.nomeCompleto, c.id);
  n += 1;
  if (!DRY) {
    await sb.storage.from("hb-cooperados").upload(path, JSON.stringify(parsed), {
      contentType: "application/json",
      upsert: true,
    });
  }
}

console.log(DRY ? `Seriam normalizados: ${n}` : `Normalizados: ${n}`);
