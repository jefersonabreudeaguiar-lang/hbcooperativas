/**
 * Cleber + Ivan — quitados: fora da fila Pagar e “a receber” zerado (pipeline completo).
 * npx tsx scripts/verify-pagar-cleber-ivan-producao.ts
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData } from "../src/types/index.ts";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import { fetchNotasFromStorage, fetchNotasFromTable, mergeNotasSources } from "../src/lib/supabase/notasStorage";
import { fetchContratosSync, fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";
import { listCooperadosDaCooperativa, mergeCloudCooperadosIntoData } from "../src/services/cooperadoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import { cooperadoPendentePagamentoResponsavel, getValorQuantoVouReceber } from "../src/services/cooperadoEntregasService";
import { getRelatorioPagarCooperadoEmAberto } from "../src/services/relatorioService";
import {
  reconciliarFichaFromNotasConferidas,
  purgarFichasInvalidas,
} from "../src/services/notaPedidoService";
import { posProcessarIntegridadePagamentosCooperativa } from "../src/services/pagamentoIntegridadeService";

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
process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL = "true";

const CNPJ = "62351750000165";
const COOP = "06342dae-8191-4193-94b6-d0be3a82e10b";
const ALVOS = ["cleber viana", "ivan arruda"];
const CLEBER_ID = "c_1782257422774_9chl9";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

function matchAlvo(nome: string): boolean {
  const n = nome.toLowerCase();
  return ALVOS.some((a) => n.includes(a));
}

function filaPagarComoUI(data: AppData) {
  const cooperadosParaPagar = listCooperadosDaCooperativa(data, COOP).filter((c) =>
    cooperadoPendentePagamentoResponsavel(data, c.id, undefined, COOP)
  );
  const relatorio = getRelatorioPagarCooperadoEmAberto(data, COOP);
  return { cooperadosParaPagar, relatorio };
}

/** Sucesso = não aparecem na fila e valor a receber ≤ 0,01. */
function reportQuitados(label: string, data: AppData): boolean {
  const alvos = data.cooperados.filter((c) => matchAlvo(c.nomeCompleto ?? ""));
  const { cooperadosParaPagar, relatorio } = filaPagarComoUI(data);
  const alvosSelect = cooperadosParaPagar.filter((c) => matchAlvo(c.nomeCompleto ?? ""));
  const alvosRel = relatorio.filter((l) => matchAlvo(l.cooperado));

  console.log(`\n=== ${label} ===`);
  console.log(
    "cooperadosParaPagar (UI select):",
    alvosSelect.map((c) => c.nomeCompleto)
  );
  console.log(
    "getRelatorioPagarCooperadoEmAberto:",
    alvosRel.map((l) => ({ nome: l.cooperado, total: l.total }))
  );

  let ok = alvosSelect.length === 0 && alvosRel.every((l) => l.total <= 0.01);
  for (const c of alvos) {
    const v = getValorQuantoVouReceber(data, c.id, COOP);
    console.log(`  ${c.nomeCompleto}: a receber R$ ${v.valor.toFixed(2)}`);
    if (v.valor > 0.01) ok = false;
  }
  return ok;
}

async function loadAppDataPipeline(): Promise<AppData> {
  const { data: rows } = await sb.from("cooperativas").select("*").eq("cnpj", CNPJ);
  const coop = cooperativaFromCloudRow(rows![0] as Record<string, unknown>);
  const [cloudCooperados, storageNotas, tableResult, contratos, operacional] = await Promise.all([
    fetchCooperadosFromStorage(sb, CNPJ),
    fetchNotasFromStorage(sb, CNPJ),
    fetchNotasFromTable(sb, CNPJ),
    fetchContratosSync(sb, CNPJ),
    fetchOperacionalSync(sb, CNPJ),
  ]);
  if (!operacional) throw new Error("sem operacional");

  const notas = mergeNotasSources(tableResult.notas, storageNotas).map((n) => ({
    ...n,
    cooperativaId: n.cooperativaId ?? coop.id,
  }));

  let data: AppData = {
    cooperativas: [coop],
    users: [],
    cooperados: [],
    mensalidades: [],
    cotas: [],
    instituicoes: [],
    produtosInstituicao: [],
    notasPedido: notas,
    fichaCorrida: operacional.fichaCorrida ?? [],
    pagamentosCooperado: operacional.pagamentosCooperado ?? [],
    arquivosMensais: operacional.arquivosMensais ?? [],
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
  data = mergeCloudCooperadosIntoData(data, cloudCooperados, CNPJ, coop.id);
  if (contratos) data = mergeContratosIntoData(data, contratos, coop.id);
  data = mergeOperacionalIntoData(data, operacional, coop.id, cloudCooperados);
  return posProcessarIntegridadePagamentosCooperativa(
    purgarFichasInvalidas(reconciliarFichaFromNotasConferidas(data))
  );
}

async function main() {
  const op = await fetchOperacionalSync(sb, CNPJ);
  if (!op) throw new Error("sem operacional");

  const fichasCleber = (op.fichaCorrida ?? []).filter((f) => f.cooperadoId === CLEBER_ID);
  const pagoCleber = fichasCleber.filter((f) => f.status === "pago").length;
  console.log(
    `NUVEM operacional: fichas Cleber ${fichasCleber.length} (status pago: ${pagoCleber})`
  );

  const pipeline = await loadAppDataPipeline();
  const rPipeline = reportQuitados("Pipeline app (notas + reconciliar + integridade)", pipeline);

  const prod = await fetch("https://hbcooperativas.vercel.app/login").then((r) => r.text()).catch(() => "");
  const buildMatch = prod.match(/APP_BUILD_VERSION[^\d]*(\d+)/) ?? prod.match(/build[=](\d+)/i);
  console.log("\n=== Produção (HTML login) ===");
  console.log("build detectado no HTML:", buildMatch?.[1] ?? "NÃO ENCONTRADO (bundle pode estar em chunk)");

  console.log("\n=== CRITÉRIO (Cleber + Ivan quitados) ===");
  console.log("Fora da fila Pagar e a receber zerado:", rPipeline ? "PASS" : "FAIL");
  process.exit(rPipeline ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
