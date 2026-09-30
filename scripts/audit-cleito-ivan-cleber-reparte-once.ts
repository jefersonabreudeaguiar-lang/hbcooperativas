/**
 * Levantamento: entregas com origem Cleito — reparte Ivan vs Cleber.
 * npx tsx scripts/audit-cleito-ivan-cleber-reparte-once.ts
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData, NotaPedido } from "../src/types";
import { round2 } from "../src/utils/calculations";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import { fetchNotasFromStorage, fetchNotasFromTable, mergeNotasSources } from "../src/lib/supabase/notasStorage";
import { fetchContratosSync, fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";
import { mergeCloudCooperadosIntoData, resolverCooperadoIdCanonico } from "../src/services/cooperadoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import { dedupeFichaCorridaPorNota } from "../src/services/notaPedidoService";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro";

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

const CNPJ = "62351750000165";

function fmt(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dividirValorEntrega(total: number, index: number, count: number): number {
  if (count <= 0) return 0;
  const base = Math.floor((total * 100) / count) / 100;
  const resto = Math.round(total * 100 - base * count * 100);
  return base + (index < resto ? 0.01 : 0);
}

async function loadData(): Promise<AppData> {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
    realtime: { transport: ws },
  });
  const { data: rows } = await supabase.from("cooperativas").select("*").eq("cnpj", CNPJ);
  const coop = cooperativaFromCloudRow(rows![0] as Record<string, unknown>);
  const [cloudCooperados, storageNotas, tableResult, contratos, operacional] = await Promise.all([
    fetchCooperadosFromStorage(supabase, CNPJ),
    fetchNotasFromStorage(supabase, CNPJ),
    fetchNotasFromTable(supabase, CNPJ),
    fetchContratosSync(supabase, CNPJ),
    fetchOperacionalSync(supabase, CNPJ),
  ]);
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
  data = mergeCloudCooperadosIntoData(data, cloudCooperados, CNPJ, coop.id);
  if (contratos) data = mergeContratosIntoData(data, contratos, coop.id);
  data = mergeOperacionalIntoData(
    data,
    operacional ?? {
      updatedAt: "",
      arquivosMensais: [],
      pagamentosCooperado: [],
      comunicados: [],
      mensalidades: [],
      descontos: [],
      config: { descontoPadraoCooperativa: 5 },
    },
    coop.id,
    cloudCooperados
  );
  return data;
}

function fichaValor(data: AppData, nota: NotaPedido, coopId: string, cooperadoId: string): number {
  const canon = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  const fichas = dedupeFichaCorridaPorNota(
    data.fichaCorrida.filter((f) => f.notaPedidoId === nota.id),
    data.notasPedido
  );
  return round2(
    fichas
      .filter((f) => resolverCooperadoIdCanonico(data, f.cooperadoId, coopId) === canon)
      .reduce((s, f) => s + f.valorLiquido, 0)
  );
}

async function main() {
  const data = await loadData();
  const coopId = data.cooperativas[0]?.id ?? "";
  const ivan = data.cooperados.find((c) => c.nomeCompleto.toLowerCase().includes("ivan arruda"));
  const cleber = data.cooperados.find((c) => c.nomeCompleto.toLowerCase().includes("cleber"));
  const cleito = data.cooperados.find((c) => c.nomeCompleto.toLowerCase().includes("cleito"));
  if (!ivan || !cleber || !cleito) {
    console.log("Cooperados não encontrados");
    return;
  }

  const cleitoCanon = resolverCooperadoIdCanonico(data, cleito.id, coopId);
  const ivanCanon = resolverCooperadoIdCanonico(data, ivan.id, coopId);
  const cleberCanon = resolverCooperadoIdCanonico(data, cleber.id, coopId);

  const notasCleitoOrigem = data.notasPedido.filter((n) => {
    const origem = n.divisaoEntrega?.cooperadoOrigemId ?? n.cooperadoId;
    return resolverCooperadoIdCanonico(data, origem, coopId) === cleitoCanon;
  });

  console.log("=== Entregas com origem Cleito (foto/lançamento) ===\n");
  console.log(`Total notas (qualquer status): ${notasCleitoOrigem.length}\n`);

  for (const n of notasCleitoOrigem.sort((a, b) => a.dataEntrega.localeCompare(b.dataEntrega))) {
    if (n.status !== "conferida" && n.status !== "pago" && n.status !== "aguardando_conferencia") continue;

    const div = n.divisaoEntrega;
    const parts = div?.participantes ?? [];
    const vIvan = fichaValor(data, n, coopId, ivan.id);
    const vCleber = fichaValor(data, n, coopId, cleber.id);
    const vCleito = fichaValor(data, n, coopId, cleito.id);

    console.log(`Nota ${n.numeroNota ?? n.id.slice(-8)} | ${n.mesReferencia} | ${n.status} | total líq. ${fmt(n.valorLiquido)}`);
    console.log(`  Data entrega: ${n.dataEntrega} | Instituição: ${n.instituicaoNome ?? "—"}`);
    if (!div || parts.length <= 1) {
      console.log(`  Divisão: NÃO (${parts.length} participante) — ficha Cleito ${fmt(vCleito)} Ivan ${fmt(vIvan)} Cleber ${fmt(vCleber)}`);
      console.log("");
      continue;
    }

    console.log(`  Divisão: ${parts.length} cooperados — ${parts.map((p) => p.cooperadoNome.split(" ")[0]).join(" + ")}`);
    console.log(`  Origem registrada: ${div.cooperadoOrigemNome}`);

    const idxIvan = parts.findIndex((p) => resolverCooperadoIdCanonico(data, p.cooperadoId, coopId) === ivanCanon);
    const idxCleber = parts.findIndex((p) => resolverCooperadoIdCanonico(data, p.cooperadoId, coopId) === cleberCanon);
    const idxCleito = parts.findIndex((p) => resolverCooperadoIdCanonico(data, p.cooperadoId, coopId) === cleitoCanon);

    if (parts.length === 2 && idxIvan >= 0 && idxCleber >= 0) {
      const espIvan = dividirValorEntrega(n.valorLiquido, idxIvan, 2);
      const espCleber = dividirValorEntrega(n.valorLiquido, idxCleber, 2);
      const diff = Math.abs(vIvan - vCleber);
      const ok = diff < 0.02 && Math.abs(vIvan - espIvan) < 0.02 && Math.abs(vCleber - espCleber) < 0.02;
      console.log(`  Ivan:   ficha ${fmt(vIvan)} (esperado 50% ${fmt(espIvan)})`);
      console.log(`  Cleber: ficha ${fmt(vCleber)} (esperado 50% ${fmt(espCleber)})`);
      console.log(`  → Ivan e Cleber ${ok ? "IGUAIS entre si (50/50)" : `DIFEREM (Δ ${fmt(diff)})`}`);
    } else if (parts.length === 3 && idxIvan >= 0 && idxCleber >= 0 && idxCleito >= 0) {
      const espIvan = dividirValorEntrega(n.valorLiquido, idxIvan, 3);
      const espCleber = dividirValorEntrega(n.valorLiquido, idxCleber, 3);
      const espCleito = dividirValorEntrega(n.valorLiquido, idxCleito, 3);
      const diffIvCl = Math.abs(vIvan - vCleber);
      const okTercos =
        Math.abs(vIvan - espIvan) < 0.02 &&
        Math.abs(vCleber - espCleber) < 0.02 &&
        Math.abs(vCleito - espCleito) < 0.02;
      console.log(`  Ivan:   ficha ${fmt(vIvan)} (esperado ⅓ ${fmt(espIvan)})`);
      console.log(`  Cleber: ficha ${fmt(vCleber)} (esperado ⅓ ${fmt(espCleber)})`);
      console.log(`  Cleito: ficha ${fmt(vCleito)} (esperado ⅓ ${fmt(espCleito)})`);
      console.log(
        `  → Ivan vs Cleber: ${diffIvCl < 0.02 ? "mesmo valor na ficha" : `diferença ${fmt(diffIvCl)}`} | reparte 3 vias ${okTercos ? "OK" : "com centavos desalinhados"}`
      );
    } else {
      for (const p of parts) {
        const v = fichaValor(data, n, coopId, p.cooperadoId);
        console.log(`  ${p.cooperadoNome}: ficha ${fmt(v)}`);
      }
    }
    console.log("");
  }

  const totIvan = notasCleitoOrigem
    .filter((n) => n.status === "conferida" || n.status === "pago")
    .reduce((s, n) => s + fichaValor(data, n, coopId, ivan.id), 0);
  const totCleber = notasCleitoOrigem
    .filter((n) => n.status === "conferida" || n.status === "pago")
    .reduce((s, n) => s + fichaValor(data, n, coopId, cleber.id), 0);
  console.log("--- Totais acumulados (notas origem Cleito, conferida/paga) ---");
  console.log(`  Ivan:   ${fmt(round2(totIvan))}`);
  console.log(`  Cleber: ${fmt(round2(totCleber))}`);
  console.log(`  Diferença Ivan − Cleber: ${fmt(round2(totIvan - totCleber))}`);
}

main().catch(console.error);
