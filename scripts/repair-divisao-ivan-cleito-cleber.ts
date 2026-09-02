/**
 * Corrige divisão Ivan + Cleber + Cleito nas notas sem divisaoEntrega.
 * npx tsx scripts/repair-divisao-ivan-cleito-cleber.ts [--dry-run]
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData, NotaPedido } from "../src/types";
import { normalizeCnpj } from "../src/utils/cooperativa";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import {
  fetchNotasFromStorage,
  fetchNotasFromTable,
  mergeNotasSources,
  notaPayloadForTable,
  uploadNotaToStorage,
  upsertNotasInTable,
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
  dividirEntregaEntreCooperados,
  divisaoFichasCobremParticipantes,
  fichasValoresAlinhadosComNota,
  sincronizarTotaisNotaComFichas,
} from "../src/services/notaPedidoService";
import { round2 } from "../src/utils/calculations";

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

const DRY_RUN = process.argv.includes("--dry-run");
const CNPJ = normalizeCnpj("62351750000165");

/** Notas que devem ser repartidas entre Ivan, Cleber e Cleito. */
const NOTA_IDS = ["np_1787660350108_srkra", "np_1788284688150_g7ubo"];

function fmt(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

async function loadData(supabase: ReturnType<typeof createClient>) {
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
  return { data, operacional, coopId: coop.id };
}

function resumoNota(data: AppData, nota: NotaPedido, coopId: string) {
  const fichas = dedupeFichaCorridaPorNota(
    data.fichaCorrida.filter((f) => f.notaPedidoId === nota.id),
    data.notasPedido
  );
  const byName = new Map<string, number>();
  for (const f of fichas) {
    const nome =
      data.cooperados.find((c) => c.id === f.cooperadoId)?.nomeCompleto?.split(" ")[0] ?? f.cooperadoId;
    byName.set(nome, round2((byName.get(nome) ?? 0) + f.valorLiquido));
  }
  const div = nota.divisaoEntrega?.participantes.map((p) => p.cooperadoNome.split(" ")[0]).join("+") ?? "—";
  const somaLiq = round2(fichas.reduce((s, f) => s + f.valorLiquido, 0));
  const alinhada = fichasValoresAlinhadosComNota(fichas, nota);
  const cobertura = divisaoFichasCobremParticipantes(data, fichas, nota);
  const ok =
    cobertura &&
    (alinhada || Math.abs(somaLiq - nota.valorLiquido) <= 0.02) &&
    (nota.divisaoEntrega?.participantes.length ?? 0) >= 3;
  return { fichas: fichas.length, byName, div, ok, alinhada, cobertura, somaLiq };
}

async function main() {
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

  const ivan = (await loadData(supabase)).data.cooperados.find((c) =>
    c.nomeCompleto.toLowerCase().includes("ivan arruda")
  );
  let { data, operacional, coopId } = await loadData(supabase);
  const cleber = data.cooperados.find((c) => c.nomeCompleto.toLowerCase().includes("cleber"));
  const cleito = data.cooperados.find((c) => c.nomeCompleto.toLowerCase().includes("cleito"));

  if (!ivan || !cleber || !cleito) {
    console.error("Cooperados não encontrados");
    process.exit(1);
  }

  console.log(`=== Reparo divisão Ivan / Cleber / Cleito ${DRY_RUN ? "(dry-run)" : ""} ===\n`);

  const notasCorrigidas: NotaPedido[] = [];

  for (const notaId of NOTA_IDS) {
    const nota = data.notasPedido.find((n) => n.id === notaId);
    if (!nota) {
      console.log(`⚠ Nota ${notaId} não encontrada`);
      continue;
    }
    if (nota.divisaoEntrega && nota.divisaoEntrega.participantes.length >= 3) {
      console.log(`✓ ${notaId} já dividida — pulando`);
      continue;
    }

    const antes = resumoNota(data, nota, coopId);
    console.log(`\n${nota.numeroNota ?? notaId} | ${fmt(nota.valorLiquido)} | ${nota.mesReferencia}`);
    console.log(`  Antes: ${antes.fichas} ficha(s) | div=${antes.div}`);
    for (const [n, v] of antes.byName) console.log(`    ${n}: ${fmt(v)}`);

    const origemId = nota.cooperadoId;
    const outrosIds = [ivan.id, cleber.id, cleito.id].filter((id) => id !== origemId);

    data = dividirEntregaEntreCooperados(data, notaId, outrosIds, coopId);
    let notaNova = data.notasPedido.find((n) => n.id === notaId)!;
    const fichasNota = data.fichaCorrida.filter((f) => f.notaPedidoId === notaId);
    if (!fichasValoresAlinhadosComNota(fichasNota, notaNova)) {
      notaNova = sincronizarTotaisNotaComFichas(notaNova, fichasNota, {
        forcarDescontoLiquido: true,
        sincronizarBruto: true,
      });
      data = {
        ...data,
        notasPedido: data.notasPedido.map((n) => (n.id === notaId ? notaNova : n)),
      };
    }
    const depois = resumoNota(data, notaNova, coopId);

    console.log(`  Depois: ${depois.fichas} ficha(s) | div=${depois.div} ${depois.ok ? "✓" : "⚠"}`);
    if (!depois.ok) {
      console.log(`    cobertura=${depois.cobertura} alinhada=${depois.alinhada} soma=${fmt(depois.somaLiq)} nota=${fmt(notaNova.valorLiquido)}`);
    }
    for (const [n, v] of depois.byName) console.log(`    ${n}: ${fmt(v)}`);

    if (!depois.ok) {
      console.error("  Falha ao alinhar divisão — abortando");
      process.exit(1);
    }
    notasCorrigidas.push(notaNova);
  }

  if (!notasCorrigidas.length) {
    console.log("\nNada a enviar.");
    return;
  }

  if (DRY_RUN) {
    console.log("\n(dry-run — nuvem não alterada)");
    return;
  }

  console.log(`\nEnviando ${notasCorrigidas.length} nota(s) e ficha corrida...`);

  for (const nota of notasCorrigidas) {
    const payload = notaPayloadForTable(nota);
    const table = await upsertNotasInTable(supabase, CNPJ, [payload], nota.cooperadoNomeSnapshot);
    if (!table.ok && !table.tableMissing) {
      console.error("Falha tabela:", table.error);
      process.exit(1);
    }
    const storage = await uploadNotaToStorage(supabase, CNPJ, payload, nota.cooperadoNomeSnapshot);
    if (!storage.ok) {
      console.error("Falha storage:", storage.error);
      process.exit(1);
    }
    console.log(`  ✓ nota ${nota.numeroNota ?? nota.id.slice(0, 16)}`);
  }

  const payload = {
    ...operacional,
    updatedAt: new Date().toISOString(),
    fichaCorrida: data.fichaCorrida.filter((f) => f.cooperativaId === coopId),
    arquivosMensais: data.arquivosMensais.filter((a) => a.cooperativaId === coopId),
  };
  const up = await uploadOperacionalSync(supabase, CNPJ, payload);
  if (!up.ok) {
    console.error("Falha operacional:", up.error);
    process.exit(1);
  }

  console.log("\n✓ Concluído. Rode: npx tsx scripts/audit-divisao-ivan-cleito-cleber.ts");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
