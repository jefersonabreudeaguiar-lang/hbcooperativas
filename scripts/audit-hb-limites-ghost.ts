import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { resolveAuthoritativeCreditosBaseCents } from "../src/modules/hb-credit/engine/creditBaseAuthoritative.ts";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage.ts";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
}

loadEnvLocal();
const CNPJ = "62351750000165";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

async function main() {
  const cooperados = await fetchCooperadosFromStorage(sb, CNPJ);
  const ids = cooperados.filter((c) => c.status === "ativo").map((c) => c.id);
  const base = await resolveAuthoritativeCreditosBaseCents(sb, CNPJ, ids);
  const { data: accs } = await sb
    .from("hb_credit_accounts")
    .select("cooperado_id,limit_released_cents,amount_used_cents")
    .eq("cooperative_cnpj", CNPJ);

  let sum = 0;
  const rows: { id: string; nome: string; lim: number; usado: number; base: number }[] = [];
  for (const a of accs ?? []) {
    const lim = Number(a.limit_released_cents);
    const usado = Number(a.amount_used_cents);
    sum += lim;
    if (lim <= 0) continue;
    const b = base?.[a.cooperado_id] ?? 0;
    rows.push({
      id: String(a.cooperado_id).slice(-8),
      nome: cooperados.find((c) => c.id === a.cooperado_id)?.nomeCompleto?.split(" ")[0] ?? "?",
      lim: lim / 100,
      usado: usado / 100,
      base: b / 100,
    });
  }
  rows.sort((x, y) => y.lim - x.lim);
  console.log("sum limit R$", (sum / 100).toFixed(2), "| contas lim>0:", rows.length);
  for (const r of rows) {
    console.log(
      `${r.nome} (${r.id}): lim R$ ${r.lim.toFixed(2)} usado R$ ${r.usado.toFixed(2)} base R$ ${r.base.toFixed(2)}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
