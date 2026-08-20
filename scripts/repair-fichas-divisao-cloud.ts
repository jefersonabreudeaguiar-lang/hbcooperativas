/**
 * Repara fichas de notas com divisão (ex.: Ivan/Cleber/Cleito).
 * Uso: npx tsx scripts/repair-fichas-divisao-cloud.ts [cnpj] [notaId]
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData } from "../src/types";
import { normalizeCnpj } from "../src/utils/cooperativa";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import {
  fetchNotasFromStorage,
  fetchNotasFromTable,
  mergeNotasSources,
} from "../src/lib/supabase/notasStorage";
import {
  fetchContratosSync,
  fetchOperacionalSync,
  uploadOperacionalSync,
} from "../src/lib/supabase/cooperativaSyncStorage";
import { mergeCloudCooperadosIntoData } from "../src/services/cooperadoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import {
  dedupeFichaCorridaPorNota,
  divisaoFichasCobremParticipantes,
  reconciliarFichaFromNotasConferidas,
  rebuildFichasNota,
} from "../src/services/notaPedidoService";

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
  console.error("Configure .env.local com NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

const CNPJ = normalizeCnpj(process.argv[2] ?? "62351750000165");
const NOTA_ALVO = process.argv[3];

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

async function loadData(): Promise<{ data: AppData; operacional: NonNullable<Awaited<ReturnType<typeof fetchOperacionalSync>>> }> {
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
  if (!operacional) throw new Error("operacional.json ausente na nuvem");

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
  return { data, operacional };
}

async function main() {
  console.log(`=== Reparo fichas divisão | CNPJ ${CNPJ} ===\n`);
  const { data: merged, operacional } = await loadData();
  const coopId = merged.cooperativas[0]?.id ?? "";

  const rawOperacional = operacional.fichaCorrida ?? [];
  const notasDivisao = merged.notasPedido.filter(
    (n) =>
      (n.status === "conferida" || n.status === "pago") &&
      (n.divisaoEntrega?.participantes.length ?? 0) > 1 &&
      (!NOTA_ALVO || n.id === NOTA_ALVO)
  );

  console.log(`Notas com divisão a verificar: ${notasDivisao.length}\n`);

  let data = merged;
  let precisaUpload = false;

  for (const nota of notasDivisao) {
    const rawFichas = rawOperacional.filter((f) => f.notaPedidoId === nota.id);
    const rawOk = divisaoFichasCobremParticipantes(merged, rawFichas, nota);
    const mergedFichas = dedupeFichaCorridaPorNota(
      data.fichaCorrida.filter((f) => f.notaPedidoId === nota.id),
      data.notasPedido
    );
    const mergedOk = divisaoFichasCobremParticipantes(data, mergedFichas, nota);

    console.log(
      `Nota ${nota.id.slice(0, 22)} | nuvem=${rawFichas.length} ok=${rawOk} | memória=${mergedFichas.length} ok=${mergedOk}`
    );

    if (!rawOk) precisaUpload = true;

    if (!mergedOk) {
      data = rebuildFichasNota(data, nota);
      precisaUpload = true;
      const depois = dedupeFichaCorridaPorNota(
        data.fichaCorrida.filter((f) => f.notaPedidoId === nota.id),
        data.notasPedido
      );
      console.log(`  → reconstruída em memória: ${depois.length} fichas`);
      for (const f of depois) {
        console.log(`     ${f.cooperadoNomeSnapshot ?? f.cooperadoId}: R$ ${f.valorLiquido.toFixed(2)}`);
      }
    }
  }

  data = reconciliarFichaFromNotasConferidas(data);

  if (!precisaUpload) {
    console.log("\nNuvem já cobre todos os participantes — nada a enviar.");
    return;
  }

  const fichaCoop = data.fichaCorrida.filter((f) => f.cooperativaId === coopId);
  const payload = {
    ...operacional,
    updatedAt: new Date().toISOString(),
    fichaCorrida: fichaCoop,
    arquivosMensais: data.arquivosMensais.filter((a) => a.cooperativaId === coopId),
  };

  const up = await uploadOperacionalSync(supabase, CNPJ, payload);
  if (!up.ok) {
    console.error("Falha no upload:", up.error);
    process.exit(1);
  }

  console.log(`\nUpload concluído: ${fichaCoop.length} lançamentos na ficha (cooperativa)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
