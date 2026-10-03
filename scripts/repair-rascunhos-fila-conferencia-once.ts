/**
 * Publica na fila entregas que ficaram em rascunho na SQL com fotos no bucket.
 * Dry-run por padrão. APPLY=1 para gravar.
 *
 * npx tsx scripts/repair-rascunhos-fila-conferencia-once.ts [cnpj]
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  countUploadedFotoParts,
  repairFilaConferenciaNotasNaNuvem,
} from "../src/lib/supabase/notasStorage.ts";
import type { NotaPedido } from "../src/types";

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
const APPLY = process.env.APPLY === "1";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");

  const sb = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });

  const { data: rows, error } = await sb
    .from("notas_pedido")
    .select("id, status, payload, updated_at")
    .eq("cooperativa_cnpj", CNPJ)
    .eq("status", "rascunho");

  if (error) throw error;

  const candidatos: Array<{ id: string; nome: string; esperado: number; parts: number }> = [];
  for (const row of rows ?? []) {
    const payload = (row.payload ?? {}) as NotaPedido;
    const id = String(row.id);
    const esperado = Math.max(payload.fotosEnviadasCount ?? 0, 0);
    if (!payload.fotoNaNuvem && esperado <= 0) continue;
    const parts = await countUploadedFotoParts(sb, CNPJ, id);
    if (parts <= 0) continue;
    if (esperado > 0 && parts < esperado) {
      console.log(
        `SKIP parcial: ${payload.cooperadoNomeSnapshot ?? "?"} …${id.slice(-8)} esperado=${esperado} parts=${parts}`
      );
      continue;
    }
    candidatos.push({
      id,
      nome: String(payload.cooperadoNomeSnapshot ?? payload.cooperadoId ?? "?"),
      esperado,
      parts,
    });
  }

  console.log(`=== Rascunhos com foto | CNPJ ${CNPJ} | APPLY=${APPLY ? "1" : "0"} ===`);
  console.log(`Candidatos a publicar: ${candidatos.length}`);
  for (const c of candidatos) {
    console.log(`  ${c.nome} | …${c.id.slice(-8)} | fotos=${c.parts}/${c.esperado || c.parts}`);
  }

  if (!APPLY) {
    console.log("\nDry-run. Para aplicar: APPLY=1 npx tsx scripts/repair-rascunhos-fila-conferencia-once.ts");
    return;
  }

  if (candidatos.length > 0) {
    const result = await repairFilaConferenciaNotasNaNuvem(sb, CNPJ);
    console.log("\nrepairFilaConferenciaNotasNaNuvem:", result);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
