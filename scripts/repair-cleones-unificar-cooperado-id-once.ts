/**
 * Cleones — unifica cadastro duplicado (storage z9fa6 → login canônico qsr08).
 * Dry-run: npx tsx scripts/repair-cleones-unificar-cooperado-id-once.ts
 * Aplicar:  $env:APPLY="1"; npx tsx scripts/repair-cleones-unificar-cooperado-id-once.ts
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Cooperado, NotaPedido, OperacionalSyncPayload } from "../src/types";
import { normalizeCnpj } from "../src/utils/cooperativa.ts";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro.ts";
import {
  fetchCooperadoFromStorage,
  fetchCooperadosFromStorage,
  uploadCooperadoToStorage,
} from "../src/lib/supabase/cooperadosStorage.ts";
import {
  fetchNotasFromTable,
  notaPayloadForTable,
  uploadNotaToStorage,
  upsertNotasInTable,
} from "../src/lib/supabase/notasStorage.ts";
import {
  fetchOperacionalSync,
  uploadOperacionalSync,
} from "../src/lib/supabase/cooperativaSyncStorage.ts";
import { COOPERADO_CLEONES_SOUSA_BURMANN_ID } from "../src/lib/cooperado/cooperadoCasosIsolados.ts";

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

const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const CNPJ = normalizeCnpj("62351750000165");
const FROM_ID = "c_1785866278549_z9fa6";
const TO_ID = COOPERADO_CLEONES_SOUSA_BURMANN_ID;

function remapCooperadoId<T extends { cooperadoId?: string }>(items: T[] | undefined): T[] {
  return (items ?? []).map((item) =>
    item.cooperadoId === FROM_ID ? { ...item, cooperadoId: TO_ID } : item
  );
}

function remapCooperadoIdCoop<T extends { cooperativaId?: string; cooperadoId?: string }>(
  items: T[] | undefined,
  coopId: string
): T[] {
  return (items ?? []).map((item) => {
    if (item.cooperadoId !== FROM_ID) return item;
    return { ...item, cooperadoId: TO_ID, cooperativaId: item.cooperativaId ?? coopId };
  });
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Defina Supabase em .env.local");

  const sb = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });
  const { data: coopRows } = await sb.from("cooperativas").select("*").eq("cnpj", CNPJ);
  if (!coopRows?.length) throw new Error("Cooperativa não encontrada");
  const coop = cooperativaFromCloudRow(coopRows[0] as Record<string, unknown>);
  const coopId = coop.id;

  const { data: appUser } = await sb
    .from("app_users")
    .select("email,cooperado_id")
    .ilike("email", "%cleoneburmman%")
    .maybeSingle();
  if (!appUser) throw new Error("app_users Cleones não encontrado");
  if (appUser.cooperado_id !== TO_ID) {
    throw new Error(`Login esperado ${TO_ID}, veio ${appUser.cooperado_id}`);
  }

  const fromCoop = await fetchCooperadoFromStorage(sb, CNPJ, FROM_ID);
  if (!fromCoop) throw new Error(`Cadastro storage ${FROM_ID} ausente`);

  const table = await fetchNotasFromTable(sb, CNPJ);
  const notasFrom = table.notas.filter((n) => n.cooperadoId === FROM_ID);
  const notasTo = table.notas.filter((n) => n.cooperadoId === TO_ID);

  const operacional = await fetchOperacionalSync(sb, CNPJ);
  if (!operacional) throw new Error("operacional.json ausente");

  const conferidasFrom = notasFrom.filter((n) => n.status === "conferida");
  const liqFrom = conferidasFrom.reduce((s, n) => s + (n.valorLiquido ?? 0), 0);

  console.log("=== Cleones unificar cooperado_id | APPLY=" + APPLY + " ===");
  console.log("FROM (remover):", FROM_ID, fromCoop.nomeCompleto);
  console.log("TO (canônico/login):", TO_ID);
  console.log("Notas a migrar:", notasFrom.length, "| conferida:", conferidasFrom.length, "| R$", liqFrom.toFixed(2));
  console.log("Notas já no TO:", notasTo.length);

  const notasAtualizadas: NotaPedido[] = notasFrom.map((n) => ({
    ...n,
    cooperadoId: TO_ID,
    cooperativaId: n.cooperativaId ?? coopId,
    updatedAt: new Date().toISOString(),
  }));

  const opNext: OperacionalSyncPayload = {
    ...operacional,
    updatedAt: new Date().toISOString(),
    pagamentosCooperado: remapCooperadoIdCoop(operacional.pagamentosCooperado, coopId),
    fichaCorrida: remapCooperadoIdCoop(operacional.fichaCorrida, coopId),
    mensalidades: remapCooperadoId(operacional.mensalidades),
    descontos: remapCooperadoId(operacional.descontos),
    arquivosMensais: remapCooperadoIdCoop(operacional.arquivosMensais, coopId),
    ajustesFichaMes: remapCooperadoIdCoop(operacional.ajustesFichaMes, coopId),
    valoresAvulsosReceber: remapCooperadoIdCoop(operacional.valoresAvulsosReceber, coopId),
  };

  const cooperadoCanon: Cooperado = {
    ...fromCoop,
    id: TO_ID,
    cooperativaId: coopId,
    updatedAt: new Date().toISOString(),
  };

  if (!APPLY) {
    console.log("\nDry-run. Para gravar: APPLY=1 npx tsx scripts/repair-cleones-unificar-cooperado-id-once.ts");
    return;
  }

  const backupDir = resolve(process.cwd(), "scripts/backups");
  mkdirSync(backupDir, { recursive: true });
  const backupPath = resolve(backupDir, `pre-repair-cleones-unificar-${Date.now()}.json`);
  writeFileSync(
    backupPath,
    JSON.stringify(
      {
        fromId: FROM_ID,
        toId: TO_ID,
        notasFromIds: notasFrom.map((n) => n.id),
        operacional,
        fromCoop,
      },
      null,
      2
    ),
    "utf8"
  );
  console.log("Backup:", backupPath);

  for (const nota of notasAtualizadas) {
    const payload = notaPayloadForTable(nota);
    const tableRes = await upsertNotasInTable(sb, CNPJ, [payload], nota.cooperadoNomeSnapshot);
    if (!tableRes.ok && !tableRes.tableMissing) {
      throw new Error(`Falha tabela nota ${nota.id}: ${tableRes.error}`);
    }
    const st = await uploadNotaToStorage(sb, CNPJ, payload, nota.cooperadoNomeSnapshot);
    if (!st.ok) throw new Error(`Falha storage nota ${nota.id}: ${st.error}`);
  }
  console.log("✓", notasAtualizadas.length, "notas migradas para", TO_ID);

  const upCoop = await uploadCooperadoToStorage(sb, CNPJ, cooperadoCanon, appUser.email);
  if (!upCoop.ok) throw new Error(upCoop.error);
  console.log("✓ cadastro canônico gravado em", TO_ID);

  const { error: delErr } = await sb.storage.from("hb-cooperados").remove([`${CNPJ}/${FROM_ID}.json`]);
  if (delErr) console.warn("Aviso ao remover cadastro duplicado:", delErr.message);
  else console.log("✓ removido cadastro duplicado", FROM_ID);

  const upOp = await uploadOperacionalSync(sb, CNPJ, opNext, {
    existingOperacional: operacional,
    skipPagamentoConfirmadoProtection: true,
  });
  if (!upOp.ok) throw new Error(`Falha operacional: ${upOp.error}`);
  console.log("✓ operacional.json atualizado");

  const { count: restFrom } = await sb
    .from("notas_pedido")
    .select("id", { count: "exact", head: true })
    .eq("cooperativa_cnpj", CNPJ)
    .eq("cooperado_id", FROM_ID);
  const { count: onTo } = await sb
    .from("notas_pedido")
    .select("id", { count: "exact", head: true })
    .eq("cooperativa_cnpj", CNPJ)
    .eq("cooperado_id", TO_ID);

  console.log("\nPós-reparo: notas FROM=", restFrom ?? 0, "| notas TO=", onTo ?? 0);
  console.log("Peça F5 / Restaurar da nuvem no aparelho do responsável.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
