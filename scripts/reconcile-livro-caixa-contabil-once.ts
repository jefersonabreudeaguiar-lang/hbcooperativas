/**
 * Audita e recompõe livro caixa contábil (pagamentos + mensalidades PIX) na nuvem.
 * Dry-run: npx tsx scripts/reconcile-livro-caixa-contabil-once.ts [cnpj]
 * Aplicar:  $env:APPLY="1"; npx tsx scripts/reconcile-livro-caixa-contabil-once.ts [cnpj]
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData } from "../src/types";
import { normalizeCnpj } from "../src/utils/cooperativa";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import { fetchNotasFromStorage, fetchNotasFromTable, mergeNotasSources } from "../src/lib/supabase/notasStorage";
import {
  fetchContratosSync,
  fetchOperacionalSync,
  uploadOperacionalSync,
  type OperacionalSyncPayload,
} from "../src/lib/supabase/cooperativaSyncStorage.ts";
import { mergeCloudCooperadosIntoData } from "../src/services/cooperadoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import {
  auditarLivroCaixaContabilCooperativa,
  reconciliarLivroCaixaContabilCooperativa,
} from "../src/services/livroCaixaService.ts";

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

const CNPJ = normalizeCnpj(process.argv[2] ?? "62351750000165");
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";

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

async function carregarAppDataNuvem(): Promise<{ data: AppData; coopId: string; operacional: OperacionalSyncPayload }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");

  const sb = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });
  const { data: rows } = await sb.from("cooperativas").select("*").eq("cnpj", CNPJ);
  if (!rows?.length) throw new Error("Cooperativa não encontrada");
  const coop = cooperativaFromCloudRow(rows[0] as Record<string, unknown>);

  const [cloudCooperados, storageNotas, tableResult, contratos, operacional] = await Promise.all([
    fetchCooperadosFromStorage(sb, CNPJ),
    fetchNotasFromStorage(sb, CNPJ),
    fetchNotasFromTable(sb, CNPJ),
    fetchContratosSync(sb, CNPJ),
    fetchOperacionalSync(sb, CNPJ),
  ]);
  if (!operacional) throw new Error("operacional.json ausente");

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

  return { data, coopId: coop.id, operacional };
}

async function main() {
  const { data: antes, coopId, operacional } = await carregarAppDataNuvem();
  const auditAntes = auditarLivroCaixaContabilCooperativa(antes, coopId);

  console.log(`=== Livro caixa contábil | CNPJ ${CNPJ} | coop ${coopId} | APPLY=${APPLY} ===\n`);
  console.log("Antes — lacunas:");
  console.log(`  pagamentos sem débito: ${auditAntes.pagamentosSemDebitoCaixa.length}`);
  if (auditAntes.pagamentosSemDebitoCaixa.length) console.log(`    ids: ${auditAntes.pagamentosSemDebitoCaixa.join(", ")}`);
  console.log(`  pagamentos sem taxa coop: ${auditAntes.pagamentosSemTaxaCoopCaixa.length}`);
  console.log(`  pagamentos sem mens. ficha: ${auditAntes.pagamentosSemMensalidadeFichaCaixa.length}`);
  console.log(`  mensalidades PIX sem crédito: ${auditAntes.mensalidadesPagasSemCreditoCaixa.length}`);
  console.log("Antes — totais:", auditAntes.totais);

  const depoisData = reconciliarLivroCaixaContabilCooperativa(antes, coopId);
  const auditDepois = auditarLivroCaixaContabilCooperativa(depoisData, coopId);

  console.log("\nDepois (simulação) — lacunas:");
  console.log(`  pagamentos sem débito: ${auditDepois.pagamentosSemDebitoCaixa.length}`);
  console.log(`  pagamentos sem taxa coop: ${auditDepois.pagamentosSemTaxaCoopCaixa.length}`);
  console.log(`  pagamentos sem mens. ficha: ${auditDepois.pagamentosSemMensalidadeFichaCaixa.length}`);
  console.log(`  mensalidades PIX sem crédito: ${auditDepois.mensalidadesPagasSemCreditoCaixa.length}`);
  console.log("Depois — totais:", auditDepois.totais);

  const livroAntes = (antes.livroCaixa ?? []).filter((l) => l.cooperativaId === coopId).length;
  const livroDepois = (depoisData.livroCaixa ?? []).filter((l) => l.cooperativaId === coopId).length;
  console.log(`\nLançamentos livro caixa: ${livroAntes} → ${livroDepois}`);

  if (!APPLY) {
    console.log("\nDry-run — defina APPLY=1 para gravar operacional na nuvem.");
    return;
  }

  const nextPayload: OperacionalSyncPayload = {
    ...operacional,
    livroCaixa: depoisData.livroCaixa ?? [],
    livroCaixaControleAnual: depoisData.livroCaixaControleAnual ?? operacional.livroCaixaControleAnual,
    livroCaixaExcluidos: depoisData.livroCaixaExcluidos ?? operacional.livroCaixaExcluidos,
    updatedAt: new Date().toISOString(),
  };

  mkdirSync(resolve(process.cwd(), "scripts/backups"), { recursive: true });
  const backupPath = resolve(
    process.cwd(),
    `scripts/backups/pre-reconcile-livro-caixa-${CNPJ}-${Date.now()}.json`
  );
  writeFileSync(backupPath, JSON.stringify(operacional, null, 2), "utf8");
  console.log(`\nBackup: ${backupPath}`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });
  await uploadOperacionalSync(sb, CNPJ, nextPayload);
  console.log("operacional.json atualizado na nuvem.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
