/**
 * Audita todas as entregas divididas entre Ivan, Cleito e Cleber.
 * npx tsx scripts/audit-divisao-ivan-cleito-cleber.ts
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData, NotaPedido } from "../src/types";
import { round2 } from "../src/utils/calculations";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import {
  fetchNotasFromStorage,
  fetchNotasFromTable,
  mergeNotasSources,
} from "../src/lib/supabase/notasStorage";
import { fetchContratosSync, fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";
import {
  fichaPertenceCooperado,
  mergeCloudCooperadosIntoData,
  resolverCooperadoIdCanonico,
} from "../src/services/cooperadoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import {
  dedupeFichaCorridaPorNota,
  divisaoFichasCobremParticipantes,
  fichasValoresAlinhadosComNota,
  rebuildFichasNota,
} from "../src/services/notaPedidoService";
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

function findTrio(data: AppData) {
  const ivan = data.cooperados.find((c) => c.nomeCompleto.toLowerCase().includes("ivan arruda"));
  const cleber = data.cooperados.find((c) => c.nomeCompleto.toLowerCase().includes("cleber"));
  const cleito = data.cooperados.find((c) => c.nomeCompleto.toLowerCase().includes("cleito"));
  return { ivan, cleber, cleito };
}

function auditNota(data: AppData, nota: NotaPedido, coopId: string, trioIds: Set<string>) {
  const div = nota.divisaoEntrega;
  const fichas = dedupeFichaCorridaPorNota(
    data.fichaCorrida.filter((f) => f.notaPedidoId === nota.id),
    data.notasPedido
  );
  const issues: string[] = [];

  if (!div || div.participantes.length <= 1) {
    const trioFichas = fichas.filter((f) => trioIds.has(resolverCooperadoIdCanonico(data, f.cooperadoId, coopId)));
    if (trioFichas.length > 1) {
      issues.push(`Sem divisaoEntrega mas ${trioFichas.length} fichas do trio`);
    }
    if (trioFichas.length === 1 && nota.valorLiquido > 0) {
      const soma = round2(trioFichas.reduce((s, f) => s + f.valorLiquido, 0));
      if (Math.abs(soma - nota.valorLiquido) < 0.02 && trioIds.has(nota.cooperadoId)) {
        issues.push(`Nota inteira na ficha de um só (${fmt(soma)}) — deveria estar dividida?`);
      }
    }
    return issues;
  }

  const partIds = div.participantes.map((p) => resolverCooperadoIdCanonico(data, p.cooperadoId, coopId));
  const trioInDiv = partIds.filter((id) => trioIds.has(id));
  if (trioInDiv.length === 0) return issues;

  if (partIds.length !== 3 || trioInDiv.length !== 3) {
    issues.push(`Participantes: ${div.participantes.map((p) => p.cooperadoNome).join(", ")} (${partIds.length})`);
  }

  if (!divisaoFichasCobremParticipantes(data, fichas, nota)) {
    issues.push("Faltam fichas para algum participante");
  }

  if (!fichasValoresAlinhadosComNota(fichas, nota)) {
    issues.push("Soma fichas ≠ valor nota");
  }

  let somaFichas = 0;
  for (let i = 0; i < div.participantes.length; i++) {
    const p = div.participantes[i];
    const esperado = dividirValorEntrega(nota.valorLiquido, i, div.participantes.length);
    const fichasP = fichas.filter(
      (f) => resolverCooperadoIdCanonico(data, f.cooperadoId, coopId) === resolverCooperadoIdCanonico(data, p.cooperadoId, coopId)
    );
    const somaF = round2(fichasP.reduce((s, f) => s + f.valorLiquido, 0));
    somaFichas += somaF;
    if (Math.abs(somaF - esperado) >= 0.02) {
      issues.push(`${p.cooperadoNome}: esperado ${fmt(esperado)} ficha ${fmt(somaF)}`);
    }
    if (fichasP.length !== 1) {
      issues.push(`${p.cooperadoNome}: ${fichasP.length} ficha(s) (esperado 1)`);
    }
  }

  if (Math.abs(round2(somaFichas) - nota.valorLiquido) >= 0.02) {
    issues.push(`Soma trio ${fmt(round2(somaFichas))} vs nota ${fmt(nota.valorLiquido)}`);
  }

  return issues;
}

async function main() {
  const data = await loadData();
  const coopId = data.cooperativas[0]?.id ?? "";
  const { ivan, cleber, cleito } = findTrio(data);
  if (!ivan || !cleber || !cleito) {
    console.log("Trio não encontrado", { ivan: ivan?.nomeCompleto, cleber: cleber?.nomeCompleto, cleito: cleito?.nomeCompleto });
    return;
  }

  const trioIds = new Set([ivan.id, cleber.id, cleito.id].map((id) => resolverCooperadoIdCanonico(data, id, coopId)));

  console.log("=== Divisão Ivan / Cleber / Cleito ===\n");
  console.log(`Ivan:   ${ivan.nomeCompleto} (${ivan.id})`);
  console.log(`Cleber: ${cleber.nomeCompleto} (${cleber.id})`);
  console.log(`Cleito: ${cleito.nomeCompleto} (${cleito.id})\n`);

  const notasTrio = data.notasPedido.filter((n) => {
    if (n.status !== "conferida" && n.status !== "pago") return false;
    if (trioIds.has(resolverCooperadoIdCanonico(data, n.cooperadoId, coopId))) return true;
    const parts = n.divisaoEntrega?.participantes ?? [];
    return parts.some((p) => trioIds.has(resolverCooperadoIdCanonico(data, p.cooperadoId, coopId)));
  });

  console.log(`Notas conferidas/pagas ligadas ao trio: ${notasTrio.length}\n`);

  const comProblema: NotaPedido[] = [];
  for (const n of notasTrio.sort((a, b) => a.dataEntrega.localeCompare(b.dataEntrega))) {
    const issues = auditNota(data, n, coopId, trioIds);
    const div = n.divisaoEntrega;
    const label = div
      ? `[DIV ${div.participantes.length}] ${div.participantes.map((p) => p.cooperadoNome.split(" ")[0]).join("+")}`
      : "[SEM DIV]";
    console.log(`${n.id.slice(0, 24)} | ${n.mesReferencia} | ${n.status.padEnd(10)} | ${fmt(n.valorLiquido)} | ${label}`);
    if (issues.length) {
      comProblema.push(n);
      for (const i of issues) console.log(`  ⚠ ${i}`);
    } else {
      console.log("  ✓ OK");
    }
  }

  console.log(`\n--- Simulação rebuildFichasNota (${comProblema.length} nota(s) com problema) ---`);
  for (const n of comProblema) {
    const rebuilt = rebuildFichasNota(data, n);
    const issuesAfter = auditNota(rebuilt, n, coopId, trioIds);
    console.log(`\n${n.id.slice(0, 24)}: ${issuesAfter.length ? "ainda com problema" : "corrigível via rebuild"}`);
    for (const i of issuesAfter) console.log(`  ⚠ ${i}`);
  }
}

main().catch(console.error);
