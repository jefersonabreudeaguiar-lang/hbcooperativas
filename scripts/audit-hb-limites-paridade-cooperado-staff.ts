/**
 * Diagnóstico: limit_released na nuvem × limite efetivo (base M6) — paridade staff ↔ cooperado.
 *
 * npx tsx scripts/audit-hb-limites-paridade-cooperado-staff.ts
 * npx tsx scripts/audit-hb-limites-paridade-cooperado-staff.ts --cnpj=62351750000165
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ws from "ws";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage.ts";
import {
  getLimiteCooperado,
  getLimiteCooperadoAlinhadoAEntregas,
  listLimitesCooperados,
} from "../src/lib/supabase/contaCoopStorage.ts";
import { resolveAuthoritativeCreditosBaseCents } from "../src/modules/hb-credit/engine/creditBaseAuthoritative.ts";
import { resolveLimiteHbCooperadoEfetivo } from "../src/modules/hb-credit/engine/creditBaseHbGuard.ts";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* optional */
  }
}

loadEnvLocal();
if (
  !process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL &&
  !process.env.NEXT_PUBLIC_BIC_CENTRAL_READ &&
  !process.env.HB_BIC_LAB_B4_AUTHORITY
) {
  process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL = "true";
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!url || !serviceKey) {
  console.error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local");
  process.exit(1);
}

const args = process.argv.slice(2);
const cnpjArg = args.find((a) => a.startsWith("--cnpj="))?.split("=")[1]?.replace(/\D/g, "");
const CNPJ = cnpjArg || process.env.HB_RECONCILIATION_COOP_CNPJ?.replace(/\D/g, "") || "62351750000165";
const ACTOR = process.env.HB_SYNC_ACTOR_USER_ID ?? "script_audit_hb_paridade";

const sb = createClient(url, serviceKey, { auth: { persistSession: false }, realtime: { transport: ws } });

function br(cents: number) {
  return `R$ ${(cents / 100).toFixed(2)}`;
}

async function tetoPercent(sb: SupabaseClient): Promise<number> {
  const { data: cap } = await sb
    .from("hb_credit_cooperative_caps")
    .select("teto_percent")
    .eq("cooperative_cnpj", CNPJ)
    .maybeSingle();
  return cap?.teto_percent != null ? Number(cap.teto_percent) : 100;
}

async function main() {
  console.log("HB Créditos — auditoria paridade cooperado × responsável (efetivo M6)");
  console.log("CNPJ:", CNPJ);

  const cooperados = (await fetchCooperadosFromStorage(sb, CNPJ)).filter((c) => c.status === "ativo");
  const ids = cooperados.map((c) => c.id);
  const bases = await resolveAuthoritativeCreditosBaseCents(sb, CNPJ, ids);
  if (!bases) {
    console.error("Não foi possível resolver crédito-base autoritativo.");
    process.exit(1);
  }

  const teto = await tetoPercent(sb);
  const limitesRaw = await listLimitesCooperados(sb, CNPJ);
  const byCoop = new Map(limitesRaw.map((l) => [l.cooperadoId, l]));

  type Row = {
    id: string;
    nome: string;
    syncState: string;
    dbLiberado: number;
    staffEfetivo: number;
    coopApiEfetivo: number;
    baseCents: number;
    issues: string[];
  };

  const rows: Row[] = [];
  let driftCount = 0;

  for (const c of cooperados) {
    const raw = byCoop.get(c.id);
    if (!raw) continue;

    const { data: accRow } = await sb
      .from("hb_credit_accounts")
      .select("financial_limit_sync_state, limit_released_cents")
      .eq("cooperative_cnpj", CNPJ)
      .eq("cooperado_id", raw.cooperadoId)
      .maybeSingle();

    const syncState = String(accRow?.financial_limit_sync_state ?? "SYNCED");
    const base = bases[c.id] ?? 0;
    const staffEff = resolveLimiteHbCooperadoEfetivo(raw, base, teto);
    const dbLiberado = raw.limiteLiberadoCents;

    const coopCap = staffEff.limiteLiberadoCents;
    const coopApi = dbLiberado > coopCap ? coopCap : dbLiberado;

    const issues: string[] = [];
    if (syncState !== "SYNCED") issues.push(`sync_state=${syncState}`);
    if (dbLiberado !== staffEff.limiteLiberadoCents) {
      issues.push(`DB ${br(dbLiberado)} ≠ staff ${br(staffEff.limiteLiberadoCents)}`);
    }
    if (coopApi !== staffEff.limiteLiberadoCents) {
      issues.push(`API cap ${br(coopApi)} ≠ staff ${br(staffEff.limiteLiberadoCents)}`);
    }

    if (issues.length) driftCount += 1;

    rows.push({
      id: c.id,
      nome: c.nomeCompleto ?? c.id,
      syncState,
      dbLiberado,
      staffEfetivo: staffEff.limiteLiberadoCents,
      coopApiEfetivo: coopApi,
      baseCents: base,
      issues,
    });
  }

  const comProblema = rows.filter((r) => r.issues.length);
  console.log(`\nCooperados ativos com conta HB: ${rows.length}`);
  console.log(`Com desvio (antes de repair): ${comProblema.length}`);

  for (const r of comProblema.slice(0, 40)) {
    console.log(
      `  • ${r.nome.split(" ")[0]} (${r.id.slice(-8)}): ${r.issues.join(" | ")} | base ${br(r.baseCents)}`
    );
  }
  if (comProblema.length > 40) {
    console.log(`  … +${comProblema.length - 40} cooperados`);
  }

  if (args.includes("--repair")) {
    console.log("\nRepair — ensurePersisted por cooperado com conta…");
    let fixed = 0;
    for (const r of rows) {
      await getLimiteCooperadoAlinhadoAEntregas(sb, CNPJ, r.id, {
        ensurePersisted: true,
        actorUserId: ACTOR,
      });
      const after = await getLimiteCooperado(sb, CNPJ, r.id);
      const staffAfter = resolveLimiteHbCooperadoEfetivo(
        after ?? { cooperadoId: r.id, limiteLiberadoCents: 0, valorUsadoCents: 0, valorDisponivelCents: 0, bloqueado: false },
        r.baseCents,
        teto
      );
      if (after && after.limiteLiberadoCents === staffAfter.limiteLiberadoCents) {
        fixed += 1;
      }
    }
    console.log(`Pós-repair alinhados (liberado DB = staff efetivo): ${fixed}/${rows.length}`);
  }

  process.exit(comProblema.length && !args.includes("--repair") ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
