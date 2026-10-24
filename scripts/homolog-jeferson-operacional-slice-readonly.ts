/**
 * Homolog rápido — só operacional.json + slice Jeferson (read-only).
 * npx tsx scripts/homolog-jeferson-operacional-slice-readonly.ts
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const JEFERSON = "c_1781981564381_w67gg";
const CNPJ = "62351750000165";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SKIP homolog nuvem — sem .env.local");
    process.exit(0);
  }

  const sb = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });
  const { data: blob, error } = await sb.storage.from("hb-cooperativa-sync").download(`${CNPJ}/operacional.json`);
  if (error || !blob) {
    console.error("operacional.json indisponível:", error?.message ?? "sem blob");
    process.exit(1);
  }
  const operacional = JSON.parse(await blob.text()) as {
    fichaCorrida?: { cooperadoId?: string }[];
    pagamentosCooperado?: { cooperadoId?: string }[];
  };
  const fichas = (operacional.fichaCorrida ?? []).filter((f) => f.cooperadoId === JEFERSON);
  const pags = (operacional.pagamentosCooperado ?? []).filter((p) => p.cooperadoId === JEFERSON);
  console.log(
    JSON.stringify(
      { cooperadoId: JEFERSON, cnpj: CNPJ, fichas: fichas.length, pagamentos: pags.length },
      null,
      2
    )
  );
  if (fichas.length === 0 && pags.length === 0) {
    console.error("HOMOLOG: slice Jeferson vazio no operacional");
    process.exit(2);
  }
  console.log("OK homolog-jeferson-operacional-slice-readonly");
}

void main();
