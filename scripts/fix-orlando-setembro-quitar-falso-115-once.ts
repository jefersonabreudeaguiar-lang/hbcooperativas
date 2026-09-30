/**
 * Orlando set/2026 — remove entrega fantasma (2026-0207 → R$ 115,82 a receber)
 * e confirma pagamento real (2026-0146 → R$ 123,42 c/ mensalidade + HB 79,90).
 *
 * Dry-run: npx tsx scripts/fix-orlando-setembro-quitar-falso-115-once.ts
 * Aplicar:  $env:APPLY="1"; npx tsx scripts/fix-orlando-setembro-quitar-falso-115-once.ts
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData } from "../src/types";
import { normalizeCnpj } from "../src/utils/cooperativa";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import {
  fetchNotasFromStorage,
  fetchNotasFromTable,
  mergeNotasSources,
  deleteNotaFromStorage,
  deleteNotaFromTable,
} from "../src/lib/supabase/notasStorage";
import {
  fetchContratosSync,
  fetchOperacionalSync,
  uploadOperacionalSync,
} from "../src/lib/supabase/cooperativaSyncStorage";
import { mergeCloudCooperadosIntoData } from "../src/services/cooperadoCloudService";
import {
  buildOperacionalPayloadForTests,
  mergeContratosIntoData,
  mergeOperacionalIntoData,
} from "../src/services/cooperativaSyncCloudService";
import {
  confirmarPagamentoCooperado,
  excluirEntregaNota,
  getPagamentoConfirmadoCooperadoMes,
  getTotalAPagarCooperado,
  podeExcluirEntregaNota,
  reconciliarFichaFromNotasConferidas,
} from "../src/services/notaPedidoService";
import { posProcessarIntegridadePagamentosCooperativa } from "../src/services/pagamentoIntegridadeService";
import {
  cooperadoMesQuitado,
  getValorQuantoVouReceber,
  listarMesesPagosCooperado,
} from "../src/services/cooperadoEntregasService";
import { bicCentralValorAReceberAgregado } from "../src/services/bicLeituraCentralCooperado";

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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Configure .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

const CNPJ = normalizeCnpj("62351750000165");
const ORLANDO = "c_1782263929381_ncp55";
const MES = "2026-09";
const NOTA_FANTASMA_ID = "np_1790468465026_odrs8"; // 2026-0207
const NOTA_PAGA_ID = "np_1788303617362_vyhfo"; // 2026-0146
const PG_ID = "pg_1790308339483";
const VALOR_PAGAMENTO_ESPERADO = 123.42;
const ASSINATURA_REPARO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

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
    notasPedidoExcluidas: [],
    auditLog: [],
    config: { descontoPadraoCooperativa: 5 },
  };
}

async function loadData() {
  const { data: rows } = await supabase.from("cooperativas").select("*").eq("cnpj", CNPJ);
  if (!rows?.length) throw new Error(`Cooperativa não encontrada: ${CNPJ}`);
  const coop = cooperativaFromCloudRow(rows[0] as Record<string, unknown>);
  const [cloudCooperados, storageNotas, tableResult, contratos, operacional] = await Promise.all([
    fetchCooperadosFromStorage(supabase, CNPJ),
    fetchNotasFromStorage(supabase, CNPJ),
    fetchNotasFromTable(supabase, CNPJ),
    fetchContratosSync(supabase, CNPJ),
    fetchOperacionalSync(supabase, CNPJ),
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
  data = posProcessarIntegridadePagamentosCooperativa(reconciliarFichaFromNotasConferidas(data));
  return { data, operacional, coopId: coop.id };
}

function metricas(data: AppData, coopId: string) {
  return {
    aReceber: getTotalAPagarCooperado(data, ORLANDO, undefined, coopId),
    bic: bicCentralValorAReceberAgregado(data, ORLANDO, coopId).valor,
    motor: getValorQuantoVouReceber(data, ORLANDO, coopId).valor,
    mesesPagos: listarMesesPagosCooperado(data, ORLANDO, coopId),
    quitadoSet: cooperadoMesQuitado(data, ORLANDO, MES),
    pgConfirmado: getPagamentoConfirmadoCooperadoMes(data, ORLANDO, MES)?.valorLiquido ?? null,
  };
}

function aplicarReparo(data: AppData, coopId: string): AppData {
  const pg = data.pagamentosCooperado.find((p) => p.id === PG_ID);
  if (!pg) throw new Error(`Pagamento ${PG_ID} não encontrado`);
  if (Math.abs(Number(pg.valorLiquido) - VALOR_PAGAMENTO_ESPERADO) > 0.02) {
    throw new Error(`Valor pagamento inesperado: ${pg.valorLiquido} (esperado ${VALOR_PAGAMENTO_ESPERADO})`);
  }
  if (!(pg.notaPedidoIds ?? []).includes(NOTA_PAGA_ID)) {
    throw new Error("Pagamento não referencia nota 2026-0146");
  }

  const notaFantasma = data.notasPedido.find((n) => n.id === NOTA_FANTASMA_ID);
  if (notaFantasma) {
    const check = podeExcluirEntregaNota(data, NOTA_FANTASMA_ID, coopId);
    if (!check.ok) throw new Error(`Não pode excluir 2026-0207: ${check.reason}`);
    const ex = excluirEntregaNota(data, NOTA_FANTASMA_ID, coopId);
    if (!ex.ok) throw new Error(`Falha excluir 2026-0207: ${ex.reason}`);
    data = ex.data;
  }

  if (pg.status === "aguardando_confirmacao") {
    data = confirmarPagamentoCooperado(data, PG_ID, ASSINATURA_REPARO);
  } else if (pg.status !== "confirmado") {
    throw new Error(`Status pagamento inesperado: ${pg.status}`);
  }

  data = posProcessarIntegridadePagamentosCooperativa(reconciliarFichaFromNotasConferidas(data));
  return data;
}

async function main() {
  console.log(`=== Orlando set/2026 — quitar falso 115,82 | APPLY=${APPLY} ===\n`);
  const { data: before, operacional, coopId } = await loadData();

  const m0 = metricas(before, coopId);
  console.log("Antes:", m0);
  console.log(
    "Pagamento:",
    before.pagamentosCooperado.find((p) => p.id === PG_ID)?.status,
    "liq=",
    before.pagamentosCooperado.find((p) => p.id === PG_ID)?.valorLiquido
  );

  let after = aplicarReparo(structuredClone(before), coopId);
  const m1 = metricas(after, coopId);
  console.log("\nDepois (simulado):", m1);

  if (m1.aReceber > 0.009) {
    console.error("Abort: a receber ainda > 0 após simulação");
    process.exit(1);
  }
  if (!m1.mesesPagos.includes(MES)) {
    console.error("Abort: set/2026 não consta como pago após simulação");
    process.exit(1);
  }
  if (Math.abs((m1.pgConfirmado ?? 0) - VALOR_PAGAMENTO_ESPERADO) > 0.02) {
    console.error("Abort: valor confirmado set/2026 diverge");
    process.exit(1);
  }

  if (!APPLY) {
    console.log("\nDry-run OK — defina APPLY=1 para gravar na nuvem.");
    return;
  }

  const backupDir = resolve(process.cwd(), "scripts/backups");
  mkdirSync(backupDir, { recursive: true });
  const backupPath = resolve(backupDir, `pre-fix-orlando-setembro-${Date.now()}.json`);
  writeFileSync(backupPath, JSON.stringify(operacional, null, 2), "utf8");
  console.log("\nBackup operacional:", backupPath);

  after = aplicarReparo(before, coopId);

  const payload = {
    ...operacional,
    ...buildOperacionalPayloadForTests(after, coopId),
    updatedAt: new Date().toISOString(),
  };

  const up = await uploadOperacionalSync(supabase, CNPJ, payload, {
    existingOperacional: operacional,
    skipPagamentoConfirmadoProtection: true,
  });
  if (!up.ok) {
    console.error("Falha operacional:", up.error);
    process.exit(1);
  }

  const st = await deleteNotaFromStorage(supabase, CNPJ, NOTA_FANTASMA_ID);
  if (!st.ok) {
    console.error("Falha storage nota fantasma:", st.error);
    process.exit(1);
  }
  await deleteNotaFromTable(supabase, CNPJ, NOTA_FANTASMA_ID);

  const mFinal = metricas(after, coopId);
  console.log("\nConcluído. Métricas finais:", mFinal);
  console.log("Nota 2026-0207 removida; pagamento confirmado R$", VALOR_PAGAMENTO_ESPERADO);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
