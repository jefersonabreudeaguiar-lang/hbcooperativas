/**
 * Repara fila Conferir entregas na nuvem (zombies + órfãos storage).
 * Uso: npx tsx scripts/repair-fila-conferencia-cooperativa-once.ts [cnpj]
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { repairFilaConferenciaNotasNaNuvem } from "../src/lib/supabase/notasStorage.ts";

function loadEnvFile(path: string) {
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

const CNPJ = (process.argv[2] ?? "62351750000165").replace(/\D/g, "");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local");

  const sb = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });
  console.log("Reparando fila conferência — CNPJ", CNPJ);
  const result = await repairFilaConferenciaNotasNaNuvem(sb, CNPJ);
  console.log("OK:", result);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
