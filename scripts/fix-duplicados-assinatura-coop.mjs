/**
 * Desliga duplicatas ativas e consolida assinatura no canônico (CoopeagriPla).
 * node scripts/fix-duplicados-assinatura-coop.mjs
 */
import { assertNotProductionTarget } from "./lib/assertNotProductionTarget.mjs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  const k = t.slice(0, eq).trim();
  const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  if (!process.env[k]) process.env[k] = v;
}

assertNotProductionTarget();
const CNPJ = "62351750000165";
const DESLIGAR = [
  "c_1786721968441_xgsuz",
  "c_1786721200698_8kwkv",
  "c_1785866278549_z9fa6",
];

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  realtime: { transport: ws },
});

async function load(id) {
  const path = `${CNPJ}/${id}.json`;
  const { data: blob, error } = await sb.storage.from("hb-cooperados").download(path);
  if (error || !blob) throw new Error(`download ${id}: ${error?.message}`);
  return { path, parsed: JSON.parse(await blob.text()) };
}

async function save(path, parsed) {
  const { error } = await sb.storage.from("hb-cooperados").upload(path, JSON.stringify(parsed), {
    contentType: "application/json",
    upsert: true,
  });
  if (error) throw new Error(`upload ${path}: ${error.message}`);
}

for (const id of DESLIGAR) {
  try {
    const { path, parsed } = await load(id);
    if (parsed.cooperado.status === "desligado") {
      console.log("OK já desligado:", id);
      continue;
    }
    parsed.cooperado.status = "desligado";
    parsed.cooperado.updatedAt = new Date().toISOString();
    parsed.cooperado.observacoes = [
      parsed.cooperado.observacoes,
      `Cadastro duplicado desligado (${new Date().toISOString().slice(0, 10)}).`,
    ]
      .filter(Boolean)
      .join(" ");
    await save(path, parsed);
    console.log("Desligado:", id);
  } catch (e) {
    console.error(id, e.message);
  }
}

console.log("Concluído.");
