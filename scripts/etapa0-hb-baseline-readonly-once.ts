/**
 * Etapa 0 HB Créditos — baseline produção (read-only, sem writes).
 * npx tsx scripts/etapa0-hb-baseline-readonly-once.ts [cnpj]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { normalizeCnpj } from "../src/utils/cooperativa";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import { fetchNotasFromStorage, fetchNotasFromTable, mergeNotasSources } from "../src/lib/supabase/notasStorage";
import { fetchContratosSync, fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";
import { mergeCloudCooperadosIntoData } from "../src/services/cooperadoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import { reconciliarFichaFromNotasConferidas } from "../src/services/notaPedidoService";
import type { AppData } from "../src/types";
import { resolveAuthoritativeCreditBase } from "../src/modules/hb-credit/engine/creditBaseAuthoritative";
import { getCreditoBaseCooperadoCents } from "../src/modules/hb-credit/engine/creditBaseFromFicha";
import { prepararAppDataParaCreditoBaseHb } from "../src/modules/hb-credit/engine/creditBaseHbGuard";
import {
  getCooperativaLiberacaoPercentConfigured,
  getTetoPercentConfigured,
  resolveTetoGlobal,
} from "../src/lib/supabase/contaCoopStorage";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const CNPJ = normalizeCnpj(process.argv[2] ?? "62351750000165");

function emptyAppData(): AppData {
  return {
    cooperativas: [],
    users: [],
    cooperados: [],
    mensalidades: [],
    cotas: [],
    instituicoes: [],
    produtosInstituicao: [],
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    ajustesFichaMes: [],
    entregas: [],
    descontos: [],
    valoresAvulsosReceber: [],
    pagamentos: [],
    financeiro: [],
    comunicados: [],
    reclamacoes: [],
    votacaoPautas: [],
    votacaoVotos: [],
    propriedades: [],
    veiculos: [],
    fechamentos: [],
    livroCaixa: [],
    prestacoesContas: [],
    auditLog: [],
    config: { descontoPadraoCooperativa: 5 },
  };
}

async function probeProduction() {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://hbcooperativas.vercel.app";
  try {
    const rel = await fetch(`${base}/api/client-release`);
    const status = await fetch(`${base}/api/credit/status`);
    const relJson = rel.ok ? await rel.json() : null;
    const stJson = status.ok ? await status.json() : null;
    console.log("Produção app:", base);
    console.log("  client-release:", relJson ? JSON.stringify(relJson) : `HTTP ${rel.status}`);
    console.log("  /api/credit/status:", stJson ? JSON.stringify(stJson) : `HTTP ${status.status}`);
  } catch (e) {
    console.log("  (probe HTTP falhou)", e instanceof Error ? e.message : e);
  }
}

async function main() {
  console.log(`\n════════ ETAPA 0 — HB Créditos baseline (read-only) | ${CNPJ} ════════\n`);
  await probeProduction();

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
    realtime: { transport: ws },
  });

  const { data: coopRows } = await sb.from("cooperativas").select("*").eq("cnpj", CNPJ);
  if (!coopRows?.length) throw new Error("Cooperativa não encontrada");
  const coop = cooperativaFromCloudRow(coopRows[0] as Record<string, unknown>);

  const { data: capRow } = await sb
    .from("hb_credit_cooperative_caps")
    .select("*")
    .eq("cooperative_cnpj", CNPJ)
    .maybeSingle();
  const tetoPct = await getTetoPercentConfigured(sb, CNPJ);
  const libPct = await getCooperativaLiberacaoPercentConfigured(sb, CNPJ);
  console.log("\n--- Config nuvem ---");
  console.log("caps:", capRow ? "OK" : "AUSENTE");
  console.log(`teto %: ${tetoPct ?? "—"} | liberação coletiva %: ${libPct ?? "—"}`);

  const { data: accs, error: accErr } = await sb
    .from("hb_credit_accounts")
    .select(
      "cooperado_id,limit_released_cents,amount_used_cents,financial_limit_sync_state,updated_at"
    )
    .eq("cooperative_cnpj", CNPJ);
  if (accErr) console.log("hb_credit_accounts:", accErr.message);

  const { data: appUsers } = await sb
    .from("app_users")
    .select("cooperado_id,active,role")
    .eq("cooperative_cnpj", CNPJ);

  const [cloudCooperados, storageNotas, tableResult, contratos, operacional] = await Promise.all([
    fetchCooperadosFromStorage(sb, CNPJ),
    fetchNotasFromStorage(sb, CNPJ),
    fetchNotasFromTable(sb, CNPJ),
    fetchContratosSync(sb, CNPJ),
    fetchOperacionalSync(sb, CNPJ),
  ]);

  console.log("\n--- Fontes ---");
  console.log(`operacional.json: ${operacional ? "OK" : "AUSENTE ✗"}`);
  console.log(`cooperados storage: ${cloudCooperados.length} | notas: ${mergeNotasSources(tableResult.notas, storageNotas).length}`);

  if (!operacional) {
    console.log("\n✗ Sem operacional — baseline financeiro incompleto. Etapa 1+ bloqueada até restore/sync.");
    return;
  }

  const notas = mergeNotasSources(tableResult.notas, storageNotas).map((n) => ({
    ...n,
    cooperativaId: n.cooperativaId ?? coop.id,
  }));
  let data = emptyAppData();
  data.cooperativas = [coop];
  data = mergeCloudCooperadosIntoData(data, cloudCooperados, CNPJ, coop.id);
  data = { ...data, notasPedido: notas };
  if (contratos) data = mergeContratosIntoData(data, contratos, coop.id);
  data = mergeOperacionalIntoData(data, operacional, coop.id, cloudCooperados);
  data = reconciliarFichaFromNotasConferidas(data);
  const sane = prepararAppDataParaCreditoBaseHb(data, CNPJ);

  const cooperados = data.cooperados
    .filter((c) => c.cooperativaId === coop.id && c.status === "ativo")
    .sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR"));
  const ids = cooperados.map((c) => c.id);

  const auth = await resolveAuthoritativeCreditBase(sb, CNPJ, ids);
  const basesAuth = auth.ok ? auth.creditosBaseCents : Object.fromEntries(ids.map((id) => [id, 0]));
  const teto = await resolveTetoGlobal(sb, CNPJ, basesAuth);

  const accMap = new Map((accs ?? []).map((a) => [String(a.cooperado_id), a]));
  const loginIds = new Set(
    (appUsers ?? [])
      .filter((u) => u.active !== false && String(u.role).toLowerCase() === "cooperado" && u.cooperado_id)
      .map((u) => String(u.cooperado_id))
  );

  const withBaseAuth = ids.filter((id) => (basesAuth[id] ?? 0) > 0).length;
  const withBaseLocal = ids.filter((id) => getCreditoBaseCooperadoCents(sane, id, coop.id) > 0).length;
  const comLim = (accs ?? []).filter((a) => Number(a.limit_released_cents) > 0).length;
  const stale = (accs ?? []).filter((a) => a.financial_limit_sync_state === "STALE").length;

  console.log("\n--- Resumo ---");
  console.log(`Cooperados ativos: ${cooperados.length}`);
  console.log(`Contas hb_credit_accounts: ${accs?.length ?? 0} | limit_released>0: ${comLim}`);
  console.log(`Crédito-base autoritativo >0: ${withBaseAuth} | motor local >0: ${withBaseLocal}`);
  if (!auth.ok) console.log(`✗ authoritative: ${auth.code} — ${auth.message}`);
  console.log(`Teto global: ${teto.configured ? `R$ ${(teto.cents / 100).toFixed(2)} (${teto.percent}%)` : teto.error ?? "não configurado"}`);
  console.log(`Sync state STALE: ${stale} | logins cooperado app_users: ${loginIds.size}`);

  const gapBaseSemLim = cooperados.filter(
    (c) => (basesAuth[c.id] ?? 0) > 0 && Number(accMap.get(c.id)?.limit_released_cents ?? 0) <= 0
  ).length;
  console.log(`Gap Etapa 3 (base>0, limite nuvem 0): ${gapBaseSemLim}`);

  console.log("\n--- Tabela cooperado (CSV) ---");
  console.log("nome;cooperado_id;base_auth_brl;base_local_brl;limit_released_brl;usado_brl;sync_state;login_app");
  for (const c of cooperados) {
    const acc = accMap.get(c.id);
    const ba = (basesAuth[c.id] ?? 0) / 100;
    const bl = getCreditoBaseCooperadoCents(sane, c.id, coop.id) / 100;
    const lim = Number(acc?.limit_released_cents ?? 0) / 100;
    const usado = Number(acc?.amount_used_cents ?? 0) / 100;
    const st = acc?.financial_limit_sync_state ?? "—";
    const login = loginIds.has(c.id) ? "sim" : "nao";
    const nome = c.nomeCompleto.replace(/;/g, ",").slice(0, 40);
    console.log(
      `${nome};${c.id};${ba.toFixed(2)};${bl.toFixed(2)};${lim.toFixed(2)};${usado.toFixed(2)};${st};${login}`
    );
  }

  console.log("\n--- Próxima etapa sugerida ---");
  if (!auth.ok || !teto.configured) console.log("→ Etapa 1: infra/flags/migrations/teto");
  else if (gapBaseSemLim > 0 || comLim === 0) console.log("→ Etapa 3: sync-limite (staff Conta Coop + cooperados abrir app)");
  else if (withBaseAuth < cooperados.length) console.log("→ Etapa 2: crédito-base vs ficha (quem tem A receber sem base)");
  else console.log("→ Etapa 4–5: paridade mobile e pagamento mercado");

  console.log("\n════════ Fim Etapa 0 ════════\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
