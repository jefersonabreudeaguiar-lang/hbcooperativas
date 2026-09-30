/**
 * Garante divisão Ivan+Cleber+Cleito e fichas rateadas em todas as notas do trio.
 * Dry-run: npx tsx scripts/repair-divisao-trio-todas-notas-once.ts
 * Aplicar:  $env:APPLY="1"; npx tsx scripts/repair-divisao-trio-todas-notas-once.ts
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
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
import {
  getCooperadoNomeResolvido,
  mergeCloudCooperadosIntoData,
  resolverCooperadoIdCanonico,
} from "../src/services/cooperadoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import {
  criarDivisaoEntregaFromParticipantes,
  dedupeFichaCorridaPorNota,
  fichasDivisaoEntregaConsistentes,
  reconciliarFichaFromNotasConferidas,
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

const CNPJ = normalizeCnpj("62351750000165");
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";

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

function trioIds(data: AppData, coopId: string) {
  const ivan = data.cooperados.find((c) => c.nomeCompleto.toLowerCase().includes("ivan arruda"));
  const cleber = data.cooperados.find((c) => c.nomeCompleto.toLowerCase().includes("cleber"));
  const cleito = data.cooperados.find((c) => c.nomeCompleto.toLowerCase().includes("cleito"));
  if (!ivan || !cleber || !cleito) throw new Error("Trio Ivan/Cleber/Cleito não encontrado");
  const canon = (id: string) => resolverCooperadoIdCanonico(data, id, coopId);
  return { ivan, cleber, cleito, trioSet: new Set([ivan.id, cleber.id, cleito.id].map(canon)) };
}

function notaEnvolveTrio(data: AppData, nota: NotaPedido, trioSet: Set<string>, coopId: string): boolean {
  if (trioSet.has(resolverCooperadoIdCanonico(data, nota.cooperadoId, coopId))) return true;
  for (const p of nota.divisaoEntrega?.participantes ?? []) {
    if (trioSet.has(resolverCooperadoIdCanonico(data, p.cooperadoId, coopId))) return true;
  }
  const fichas = data.fichaCorrida.filter((f) => f.notaPedidoId === nota.id);
  let count = 0;
  for (const id of trioSet) {
    if (fichas.some((f) => resolverCooperadoIdCanonico(data, f.cooperadoId, coopId) === id)) count++;
  }
  return count >= 2;
}

function participantesTrioIguais(nota: NotaPedido, ids: string[]): boolean {
  const cur = (nota.divisaoEntrega?.participantes ?? []).map((p) => p.cooperadoId).sort().join("|");
  const exp = [...ids].sort().join("|");
  return cur === exp && (nota.divisaoEntrega?.participantes.length ?? 0) === 3;
}

function ensureDivisaoTrio(
  data: AppData,
  nota: NotaPedido,
  coopId: string,
  ids: string[]
): { data: AppData; nota: NotaPedido; changed: boolean } {
  const origemId = nota.divisaoEntrega?.cooperadoOrigemId ?? nota.cooperadoId;
  const origemNome =
    nota.divisaoEntrega?.cooperadoOrigemNome?.trim() ||
    nota.cooperadoNomeSnapshot?.trim() ||
    getCooperadoNomeResolvido(data, origemId, coopId);
  const divisao = criarDivisaoEntregaFromParticipantes(data, coopId, origemId, origemNome, ids);
  if (!divisao) return { data, nota, changed: false };
  if (participantesTrioIguais(nota, ids) && nota.divisaoEntrega?.cooperadoOrigemId === origemId) {
    return { data, nota, changed: false };
  }
  const notaAtual: NotaPedido = {
    ...nota,
    divisaoEntrega: divisao,
    updatedAt: new Date().toISOString(),
  };
  const notasPedido = data.notasPedido.map((n) => (n.id === nota.id ? notaAtual : n));
  return { data: { ...data, notasPedido }, nota: notaAtual, changed: true };
}

function resumoNota(data: AppData, nota: NotaPedido, coopId: string) {
  const fichas = dedupeFichaCorridaPorNota(
    data.fichaCorrida.filter((f) => f.notaPedidoId === nota.id),
    data.notasPedido
  );
  const ok = fichasDivisaoEntregaConsistentes(data, data.fichaCorrida, nota);
  const byName = new Map<string, number>();
  for (const f of fichas) {
    const nome =
      data.cooperados.find((c) => c.id === f.cooperadoId)?.nomeCompleto?.split(" ")[0] ?? f.cooperadoId;
    byName.set(nome, (byName.get(nome) ?? 0) + f.valorLiquido);
  }
  return { ok, fichas: fichas.length, byName, div: nota.divisaoEntrega?.participantes.length ?? 0 };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Defina Supabase em .env.local");

  const supabase = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });
  let { data, operacional, coopId } = await loadData(supabase);
  const { ivan, cleber, cleito, trioSet } = trioIds(data, coopId);
  const ids = [ivan.id, cleber.id, cleito.id];

  console.log(`=== Reparo divisão trio | APPLY=${APPLY} ===\n`);

  const alvo = data.notasPedido.filter(
    (n) =>
      (n.status === "conferida" || n.status === "pago") &&
      notaEnvolveTrio(data, n, trioSet, coopId)
  );

  console.log(`Notas alvo: ${alvo.length}\n`);

  const notasAlteradas = new Set<string>();

  for (const nota of alvo) {
    const ensured = ensureDivisaoTrio(data, nota, coopId, ids);
    data = ensured.data;
    if (ensured.changed) notasAlteradas.add(nota.id);
  }

  data = reconciliarFichaFromNotasConferidas(data);

  for (const nota of alvo) {
    const n = data.notasPedido.find((x) => x.id === nota.id)!;
    if (!resumoNota(data, n, coopId).ok) {
      console.error(`\nFalha pós-reparo: ${nota.id}`);
      process.exit(1);
    }
    notasAlteradas.add(nota.id);
  }

  for (const nota of alvo) {
    const n = data.notasPedido.find((x) => x.id === nota.id)!;
    const depois = resumoNota(data, n, coopId);
    console.log(
      `${n.numeroNota ?? n.id.slice(-8)} | ${fmt(n.valorLiquido)} | ${[...depois.byName.entries()].map(([k, v]) => `${k} ${fmt(v)}`).join(" · ")}`
    );
  }

  if (!APPLY) {
    console.log("\nDry-run — defina APPLY=1 para gravar.");
    return;
  }

  const backupDir = resolve(process.cwd(), "scripts/backups");
  mkdirSync(backupDir, { recursive: true });
  const backupPath = resolve(backupDir, `pre-repair-divisao-trio-${Date.now()}.json`);
  writeFileSync(
    backupPath,
    JSON.stringify({ operacional, notasIds: [...notasAlteradas] }, null, 2),
    "utf8"
  );
  console.log("\nBackup:", backupPath);

  for (const notaId of notasAlteradas) {
    const nota = data.notasPedido.find((n) => n.id === notaId);
    if (!nota) continue;
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
    console.log(`  ✓ nota ${nota.numeroNota ?? notaId}`);
  }

  const fichaCoop = data.fichaCorrida.filter((f) => f.cooperativaId === coopId);
  const up = await uploadOperacionalSync(
    supabase,
    CNPJ,
    {
      ...operacional,
      updatedAt: new Date().toISOString(),
      fichaCorrida: fichaCoop,
      arquivosMensais: data.arquivosMensais.filter((a) => a.cooperativaId === coopId),
    },
    { existingOperacional: operacional, skipPagamentoConfirmadoProtection: true }
  );
  if (!up.ok) {
    console.error("Falha operacional:", up.error);
    process.exit(1);
  }

  console.log("\n✓ Nuvem atualizada. Rode: npx tsx scripts/audit-divisao-ivan-cleito-cleber.ts");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
