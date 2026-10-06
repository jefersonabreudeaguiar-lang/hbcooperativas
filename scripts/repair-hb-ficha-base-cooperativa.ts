/**
 * Reparo HB Créditos × ficha base (cooperativa inteira)
 *
 * Projeta transações `hb_credit_transactions` → `operacional.json` /
 * `arquivosMensais[].contaCoopDescontos`, alinhando resumo de pagamento e
 * “A receber” ao extrato HB (mesma fonte do authorize pós-compra).
 *
 * Uso (padrão = simulação, não grava):
 *   npx tsx scripts/repair-hb-ficha-base-cooperativa.ts
 *   npx tsx scripts/repair-hb-ficha-base-cooperativa.ts --cnpj=62351750000165
 *   npx tsx scripts/repair-hb-ficha-base-cooperativa.ts --cooperado=c_1787099452913_as4ha
 *   npx tsx scripts/repair-hb-ficha-base-cooperativa.ts --apply
 *   npx tsx scripts/repair-hb-ficha-base-cooperativa.ts --apply --json
 *
 * Requer `.env.local` com NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
 *
 * Política do app (src/lib/hb-credit/hbFichaBaseOperacional.ts):
 *   Padrão — meses com débito em aberto; sync no app + projeção no authorize/cron.
 *   Regressão — NEXT_PUBLIC_HB_FICHA_BASE_LEGACY=1 (formato anterior).
 *   Off — NEXT_PUBLIC_HB_FICHA_BASE_PROJECTION=0.
 */
import ws from "ws";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData, Cooperado } from "../src/types";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro";
import { normalizeCnpj } from "../src/utils/cooperativa";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import { fetchNotasFromStorage, fetchNotasFromTable, mergeNotasSources } from "../src/lib/supabase/notasStorage";
import { fetchContratosSync, fetchOperacionalSync, type OperacionalSyncPayload } from "../src/lib/supabase/cooperativaSyncStorage";
import { mergeCloudCooperadosIntoData, resolverCooperadoIdCanonico } from "../src/services/cooperadoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import { getTotalAPagarCooperado, reconciliarFichaFromNotasConferidas } from "../src/services/notaPedidoService";
import {
  collectContaCoopSyncJobsFromAppData,
  previewContaCoopDescontosRepairCooperativa,
  repairOperacionalContaCoopDescontosCooperativa,
  titularCooperadoIds,
  type HbFichaBaseRepairPreviewRow,
} from "../src/lib/hb-credit/repairOperacionalContaCoopDescontos";
import { listCooperadoContaCoopDescontosAbateValorReceber } from "../src/lib/supabase/contaCoopStorage";
import { dedupeDescontosContaCoopRemotos } from "../src/lib/hb-credit/mergeFichaDescontos";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    const value = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL = "true";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local");
  process.exit(1);
}

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const JSON_OUT = argv.includes("--json");
const cnpjArg = argv.find((a) => a.startsWith("--cnpj="))?.split("=")[1];
const cooperadoEq = argv.find((a) => a.startsWith("--cooperado="))?.split("=")[1];
const cooperadoFlag = argv.indexOf("--cooperado");
const cooperadoId =
  cooperadoEq ??
  argv.find((a) => a.startsWith("c_")) ??
  (cooperadoFlag >= 0 ? argv[cooperadoFlag + 1] : undefined);
const CNPJ = normalizeCnpj(cnpjArg ?? process.argv.find((a) => /^\d{14}$/.test(a)) ?? "62351750000165");

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

function fmt(v: number): string {
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}

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

async function loadAppDataForFinance(sb: SupabaseClient, cnpj: string): Promise<{ data: AppData; coopId: string }> {
  const { data: coopRows } = await sb.from("cooperativas").select("*").eq("cnpj", cnpj);
  if (!coopRows?.length) throw new Error("Cooperativa não encontrada");
  const coop = cooperativaFromCloudRow(coopRows[0] as Record<string, unknown>);

  const [storageNotas, tableResult, cloudCooperados, contratos, operacional] = await Promise.all([
    fetchNotasFromStorage(sb, cnpj),
    fetchNotasFromTable(sb, cnpj),
    fetchCooperadosFromStorage(sb, cnpj),
    fetchContratosSync(sb, cnpj),
    fetchOperacionalSync(sb, cnpj),
  ]);
  if (!operacional) throw new Error("operacional.json ausente");

  const notas = mergeNotasSources(tableResult.notas, storageNotas).map((n) => ({
    ...n,
    cooperativaId: n.cooperativaId ?? coop.id,
  }));

  let data = emptyAppData();
  data.cooperativas = [coop];
  data = mergeCloudCooperadosIntoData(data, cloudCooperados, cnpj, coop.id);
  data = { ...data, notasPedido: notas };
  if (contratos) data = mergeContratosIntoData(data, contratos, coop.id);
  data = mergeOperacionalIntoData(data, operacional, coop.id, cloudCooperados);
  data = reconciliarFichaFromNotasConferidas(data);
  return { data, coopId: coop.id };
}

type CooperadoImpacto = {
  cooperadoId: string;
  nome: string;
  mesesAfetados: number;
  hbLiquidoNuvem: number;
  aReceberAntes: number;
  aReceberDepois: number;
  deltaAReceber: number;
};

async function simularImpactoFinanceiro(
  sb: SupabaseClient,
  cnpj: string,
  cooperados: Cooperado[],
  jobs: HbFichaBaseRepairPreviewRow[],
  coopId: string,
  antes: AppData
): Promise<CooperadoImpacto[]> {
  const desalinhados = jobs.filter((j) => j.precisaAtualizar);
  if (!desalinhados.length) return [];

  const op = await fetchOperacionalSync(sb, cnpj);
  if (!op) return [];

  const arquivos = [...(op.arquivosMensais ?? [])];
  const hbSyncedAt = new Date().toISOString();
  const digits = normalizeCnpj(cnpj);

  for (const job of desalinhados) {
    const titularIds = titularCooperadoIds(cooperados, job.cooperadoId);
    const remote = await listCooperadoContaCoopDescontosAbateValorReceber(
      sb,
      digits,
      titularIds,
      job.mesReferencia
    );
    const mapped = dedupeDescontosContaCoopRemotos(remote).map((d) => ({
      motivo: d.motivo,
      valorReais: d.valorReais,
      tipo: d.motivo.toLowerCase().includes("estorno") ? ("credito_avulso" as const) : ("conta_coop" as const),
      createdAt: d.createdAt ?? "",
      ...(d.hbTransactionId ? { hbTransactionId: d.hbTransactionId } : {}),
    }));
    const idx = arquivos.findIndex(
      (a) => a.cooperadoId === job.cooperadoId && a.mesReferencia === job.mesReferencia
    );
    if (idx >= 0) {
      arquivos[idx] = {
        ...arquivos[idx],
        contaCoopDescontos: mapped,
        contaCoopDescontosUpdatedAt: hbSyncedAt,
        updatedAt: hbSyncedAt,
      };
    } else {
      arquivos.push({
        id: `am_${job.cooperadoId}_${job.mesReferencia}`,
        cooperadoId: job.cooperadoId,
        cooperativaId: job.cooperativaId || coopId,
        mesReferencia: job.mesReferencia,
        notaPedidoIds: [],
        pagamentoIds: [],
        contaCoopDescontos: mapped,
        contaCoopDescontosUpdatedAt: hbSyncedAt,
        updatedAt: hbSyncedAt,
      });
    }
  }

  const opDepois: OperacionalSyncPayload = { ...op, arquivosMensais: arquivos, updatedAt: hbSyncedAt };
  let dataDepois = mergeOperacionalIntoData(antes, opDepois, coopId, antes.cooperados);
  dataDepois = reconciliarFichaFromNotasConferidas(dataDepois);

  const porCooperado = new Map<string, HbFichaBaseRepairPreviewRow[]>();
  for (const j of desalinhados) {
    const canon = resolverCooperadoIdCanonico(antes, j.cooperadoId, coopId);
    const list = porCooperado.get(canon) ?? [];
    list.push(j);
    porCooperado.set(canon, list);
  }

  const impactos: CooperadoImpacto[] = [];
  for (const [cid, rows] of porCooperado) {
    const nome = antes.cooperados.find((c) => c.id === cid)?.nomeCompleto ?? cid;
    const aReceberAntes = getTotalAPagarCooperado(antes, cid, undefined, coopId);
    const aReceberDepois = getTotalAPagarCooperado(dataDepois, cid, undefined, coopId);
    const hbLiquido = rows.reduce((s, r) => s + r.liquidoHbNuvem, 0);
    impactos.push({
      cooperadoId: cid,
      nome,
      mesesAfetados: rows.length,
      hbLiquidoNuvem: Math.round(hbLiquido * 100) / 100,
      aReceberAntes: Math.round(aReceberAntes * 100) / 100,
      aReceberDepois: Math.round(aReceberDepois * 100) / 100,
      deltaAReceber: Math.round((aReceberDepois - aReceberAntes) * 100) / 100,
    });
  }

  return impactos.sort((a, b) => Math.abs(b.deltaAReceber) - Math.abs(a.deltaAReceber));
}

async function main() {
  console.log("Carregando operacional e ficha reconciliada (nuvem)…");
  const opBefore = await fetchOperacionalSync(supabase, CNPJ);
  if (!opBefore) {
    console.error("operacional.json não encontrado na nuvem.");
    process.exit(1);
  }

  const cooperados = await fetchCooperadosFromStorage(supabase, CNPJ);
  const nomePorId = new Map(cooperados.map((c) => [c.id, c.nomeCompleto]));

  const { data: appData, coopId } = await loadAppDataForFinance(supabase, CNPJ);
  const jobsPlan = collectContaCoopSyncJobsFromAppData(appData, coopId, cooperadoId);
  const preview = await previewContaCoopDescontosRepairCooperativa(
    supabase,
    CNPJ,
    cooperadoId,
    jobsPlan
  );

  const impactos =
    preview.desalinhados > 0
      ? await simularImpactoFinanceiro(supabase, CNPJ, cooperados, preview.jobs, coopId, appData)
      : [];

  const report = {
    cnpj: CNPJ,
    modo: APPLY ? "apply" : "dry-run",
    cooperadoFiltro: cooperadoId ?? null,
    jobsEscopo: jobsPlan.length,
    mesesConferidos: preview.jobs.length,
    mesesDesalinhados: preview.desalinhados,
    impactosCooperados: impactos,
    detalheMeses: preview.jobs
      .filter((j) => j.precisaAtualizar)
      .map((j) => ({
        ...j,
        cooperadoNome: nomePorId.get(j.cooperadoId) ?? j.cooperadoId,
        gapHbMenosOperacional: Math.round((j.liquidoHbNuvem - j.liquidoOperacional) * 100) / 100,
      })),
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("\n══════════════════════════════════════════════════════════════");
    console.log("  HB Créditos × Ficha base — reconciliação cooperativa");
    console.log("══════════════════════════════════════════════════════════════");
    console.log(`CNPJ: ${CNPJ}`);
    console.log(`Modo: ${APPLY ? "APLICAR (grava nuvem)" : "SIMULAÇÃO (use --apply para gravar)"}`);
    if (cooperadoId) console.log(`Filtro cooperado: ${cooperadoId}`);
    console.log(`Meses no escopo (ficha/pagamento aberto): ${jobsPlan.length}`);
    console.log(`Meses desalinhados operacional × HB: ${preview.desalinhados} / ${preview.jobs.length}`);

    if (preview.desalinhados > 0) {
      console.log("\n── Meses a corrigir (HB na nuvem ≠ operacional) ──");
      for (const j of report.detalheMeses.slice(0, 60)) {
        console.log(
          `  ${j.cooperadoNome?.slice(0, 28).padEnd(28)} | ${j.mesReferencia} | op ${j.linhasOperacional} lin ${fmt(j.liquidoOperacional)} → HB ${j.linhasHbNuvem} lin ${fmt(j.liquidoHbNuvem)} | gap ${fmt(j.gapHbMenosOperacional)}`
        );
      }
      if (report.detalheMeses.length > 60) {
        console.log(`  … +${report.detalheMeses.length - 60} meses`);
      }
    }

    if (impactos.length > 0) {
      console.log("\n── Impacto em “A receber” (motor de pagamento, pós-projeção simulada) ──");
      let totalDelta = 0;
      for (const i of impactos.slice(0, 40)) {
        totalDelta += i.deltaAReceber;
        console.log(
          `  ${i.nome.slice(0, 32).padEnd(32)} | ${i.mesesAfetados} mês(es) | HB ref. ${fmt(i.hbLiquidoNuvem)} | a receber ${fmt(i.aReceberAntes)} → ${fmt(i.aReceberDepois)} (${i.deltaAReceber >= 0 ? "+" : ""}${fmt(i.deltaAReceber)})`
        );
      }
      if (impactos.length > 40) console.log(`  … +${impactos.length - 40} cooperados`);
      console.log(`\n  Δ agregado (soma dos deltas por cooperado): ${totalDelta >= 0 ? "+" : ""}${fmt(totalDelta)}`);
      console.log("  (Valores negativos = compras HB passam a abater corretamente no líquido.)");
    } else if (preview.desalinhados === 0) {
      console.log("\n✓ Operacional já espelha as transações HB nos meses em aberto.");
    }

    console.log("\n── O que o repair grava ──");
    console.log("  • arquivosMensais[].contaCoopDescontos ← hb_credit_transactions (dedupe por tx)");
    console.log("  • contaCoopDescontosUpdatedAt / updatedAt");
    console.log("  • Resumo de pagamento e ficha passam a listar compras HB e abater no líquido.");
    console.log("  • Não altera fichas, notas, pagamentos confirmados nem limites HB (só projeção).");
  }

  if (!APPLY) {
    if (!JSON_OUT && preview.desalinhados > 0) {
      console.log("\n→ Para gravar na nuvem: npx tsx scripts/repair-hb-ficha-base-cooperativa.ts --apply");
    }
    return;
  }

  if (preview.desalinhados === 0) {
    if (!JSON_OUT) console.log("\nNada a gravar (já alinhado).");
    return;
  }

  const backupDir = resolve(process.cwd(), "scripts/backups");
  mkdirSync(backupDir, { recursive: true });
  const backupPath = resolve(backupDir, `pre-repair-hb-ficha-base-${CNPJ}-${Date.now()}.json`);
  writeFileSync(backupPath, JSON.stringify({ operacional: opBefore }, null, 2), "utf8");
  if (!JSON_OUT) console.log(`\nBackup local: ${backupPath}`);

  const result = await repairOperacionalContaCoopDescontosCooperativa(supabase, CNPJ, { jobs: jobsPlan });

  const post = await previewContaCoopDescontosRepairCooperativa(
    supabase,
    CNPJ,
    cooperadoId,
    jobsPlan
  );

  if (JSON_OUT) {
    console.log(JSON.stringify({ ...report, apply: result, posDesalinhados: post.desalinhados }, null, 2));
  } else {
    console.log("\n── Aplicação ──");
    console.log(`  Meses verificados: ${result.checked}`);
    console.log(`  Meses atualizados: ${result.patched}`);
    console.log(`  Desalinhados restantes: ${post.desalinhados}`);
    if (result.patched > 0) {
      console.log("\n✓ operacional.json atualizado na nuvem.");
      console.log("  Cooperados: sincronizar o app (pull operacional) ou reabrir ficha para ver resumo atualizado.");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
