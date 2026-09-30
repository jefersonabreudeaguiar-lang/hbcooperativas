/**
 * Lista notas elegíveis / zombies na nuvem (tabela SQL).
 * npx tsx scripts/audit-fila-conferencia-cooperativa-once.ts [cnpj]
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  isNotaZombieNaFilaConferencia,
  notaElegivelParaFilaConferenciaResponsavel,
} from "../src/utils/notaStatus.ts";
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

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");

  const sb = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });
  const { data, error } = await sb
    .from("notas_pedido")
    .select("id, status, payload, updated_at")
    .eq("cooperativa_cnpj", CNPJ);

  if (error) throw error;

  const elegiveis: NotaPedido[] = [];
  const zombies: NotaPedido[] = [];
  const emAnaliseOutros: NotaPedido[] = [];

  for (const row of data ?? []) {
    const payload = (row.payload ?? {}) as NotaPedido;
    const nota: NotaPedido = { ...payload, id: String(row.id), status: payload.status ?? (row.status as NotaPedido["status"]) };
    if (nota.status !== "aguardando_conferencia" && nota.status !== "entregue") continue;
    if (isNotaZombieNaFilaConferencia(nota)) zombies.push(nota);
    else if (notaElegivelParaFilaConferenciaResponsavel(nota)) elegiveis.push(nota);
    else emAnaliseOutros.push(nota);
  }

  const byCoop = (list: NotaPedido[]) => {
    const m = new Map<string, number>();
    for (const n of list) {
      const k = (n.cooperadoNomeSnapshot ?? n.cooperadoId ?? "?").trim();
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  };

  console.log(`=== Fila conferência (tabela) | CNPJ ${CNPJ} ===`);
  console.log(`Elegíveis (devem aparecer): ${elegiveis.length}`);
  console.log(`Zombies (somem da lista): ${zombies.length}`);
  console.log(`Em análise (outros): ${emAnaliseOutros.length}\n`);

  if (elegiveis.length) {
    console.log("Cooperados com notas elegíveis:");
    for (const [nome, qtd] of byCoop(elegiveis)) console.log(`  ${qtd}× ${nome}`);
  }
  if (zombies.length) {
    console.log("\nZombies (status em análise + conferidaPor/dataConferencia):");
    for (const n of zombies.slice(0, 20)) {
      console.log(
        `  ${n.cooperadoNomeSnapshot ?? n.cooperadoId} | ${n.status} | conferidaPor=${n.conferidaPor ?? "—"} | ${n.numeroNota ?? n.id.slice(-8)}`
      );
    }
    if (zombies.length > 20) console.log(`  … +${zombies.length - 20}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
