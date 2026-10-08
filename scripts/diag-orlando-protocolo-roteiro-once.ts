/**
 * Imprime roteiro para Orlando (WhatsApp) + snapshot nuvem paridade Orlando vs Cleito.
 * npx tsx scripts/diag-orlando-protocolo-roteiro-once.ts
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { orlandoPwaDiagRoteiroInstrucoes } from "../src/lib/performance/orlandoPwaDiagBundle.ts";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion.ts";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    process.env[trimmed.slice(0, eq).trim()] = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));

const appUrl = (
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
  "https://hbcooperativas.vercel.app"
).replace(/\/$/, "");

async function cloudParidade() {
  const CNPJ = "62351750000165";
  const COOP = "06342dae-8191-4193-94b6-d0be3a82e10b";
  const ORLANDO = "c_1782263929381_ncp55";
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { skip: "sem .env.local (Supabase)" };
  }
  const { fetchOperacionalSync } = await import("../src/lib/supabase/cooperativaSyncStorage");
  const { fetchCooperadosFromStorage } = await import("../src/lib/supabase/cooperadosStorage");
  const { mergeCloudCooperadosIntoData } = await import("../src/services/cooperadoCloudService");
  const { mergeOperacionalIntoData } = await import("../src/services/cooperativaSyncCloudService");
  const { reconciliarFichaFromNotasConferidas } = await import("../src/services/notaPedidoService");
  const { posProcessarIntegridadePagamentosCooperativa } = await import(
    "../src/services/pagamentoIntegridadeService"
  );
  const { leituraFinanceiraParidadeCooperado } = await import(
    "../src/lib/cooperado/cooperadoFinanceiroParidadeUniversal.ts"
  );
  const {
    listarMesesPendentesPagamentoResponsavel,
  } = await import("../src/services/cooperadoEntregasService.ts");
  const { getResumoPagamentoConsolidadoCooperado, getResumoPagamentoExibicao } = await import(
    "../src/services/notaPedidoService"
  );

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
    realtime: { transport: ws },
  });
  const op = await fetchOperacionalSync(sb, CNPJ);
  if (!op) return { erro: "operacional ausente" };

  let data = {
    cooperativas: [{ id: COOP, nome: "CoopeagriPla", cnpj: CNPJ, createdAt: "", updatedAt: "" }],
    cooperados: [],
    users: [],
    mensalidades: [],
    cotas: [],
    instituicoes: [],
    produtosInstituicao: [],
    notasPedido: [],
    fichaCorrida: [],
    arquivosMensais: [],
    pagamentosCooperado: [],
    comunicados: [],
    descontos: [],
    descontosCooperado: [],
    valoresAvulsosReceber: [],
    livroCaixa: [],
    prestacoesContas: [],
    prestacoesContasExcluidas: [],
    notasPedidoExcluidas: [],
    instituicoesExcluidas: [],
    auditLog: [],
    pareceresContabeis: [],
    fechamentoSnapshots: [],
    fechamentos: [],
    financeiro: [],
    config: { descontoPadraoCooperativa: 5 },
    ajustesFichaMes: [],
    cronogramasContrato: [],
    votacaoPautas: [],
    votacaoVotos: [],
  } as import("../src/types/index.ts").AppData;

  const coopRows = await fetchCooperadosFromStorage(sb, CNPJ);
  data = mergeCloudCooperadosIntoData(data, coopRows, CNPJ);
  data = mergeOperacionalIntoData(data, op);
  data = reconciliarFichaFromNotasConferidas(data);
  data = posProcessarIntegridadePagamentosCooperativa(data);

  const paridade = leituraFinanceiraParidadeCooperado(data, ORLANDO, COOP);
  const mesesStaff = listarMesesPendentesPagamentoResponsavel(data, ORLANDO, COOP);
  let staffValor: number | null = null;
  if (mesesStaff.length > 1) {
    staffValor = getResumoPagamentoConsolidadoCooperado(data, ORLANDO, mesesStaff, COOP).valorLiquido;
  } else if (mesesStaff.length === 1) {
    staffValor = getResumoPagamentoExibicao(data, ORLANDO, mesesStaff[0]!, COOP).valorLiquido;
  }

  return {
    buildRepo: APP_BUILD_VERSION,
    orlandoNuvem: {
      mesesStaff,
      valorParidade: paridade.valorLiquido,
      valorStaffResumo: staffValor,
      alinhado: staffValor == null
        ? paridade.valorLiquido === 0
        : Math.abs((staffValor ?? 0) - paridade.valorLiquido) < 0.01,
    },
  };
}

async function main() {
  console.log("\n========== COPIE E ENVIE AO ORLANDO (WhatsApp) ==========\n");
  console.log(orlandoPwaDiagRoteiroInstrucoes(appUrl));
  console.log("\n========== REFERÊNCIA SERVIDOR (nuvem, só você) ==========\n");
  console.log(JSON.stringify(await cloudParidade(), null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
