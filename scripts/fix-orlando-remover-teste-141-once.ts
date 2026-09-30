/**
 * Remove entregas de teste Orlando (R$ 141,07 × 2) e lançamentos associados na nuvem.
 * Dry-run: npx tsx scripts/fix-orlando-remover-teste-141-once.ts
 * Aplicar:  $env:APPLY="1"; npx tsx scripts/fix-orlando-remover-teste-141-once.ts
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
  deleteNotaFromStorage,
  deleteNotaFromTable,
} from "../src/lib/supabase/notasStorage";
import {
  fetchContratosSync,
  fetchOperacionalSync,
  uploadOperacionalSync,
} from "../src/lib/supabase/cooperativaSyncStorage";
import { mergeCloudCooperadosIntoData, resolverCooperadoIdCanonico } from "../src/services/cooperadoCloudService";
import {
  buildOperacionalPayloadForTests,
  mergeContratosIntoData,
  mergeOperacionalIntoData,
} from "../src/services/cooperativaSyncCloudService";
import {
  excluirEntregaNota,
  getTotalAPagarCooperado,
  notaEnvolveCooperadoCorrecao,
  podeExcluirEntregaNota,
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
  console.error("Configure .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

const CNPJ = normalizeCnpj("62351750000165");
const ORLANDO = "c_1782263929381_ncp55";
const VALOR_TESTE = 141.07;
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";

function isValorTeste(v: number): boolean {
  return Math.abs(Number(v) - VALOR_TESTE) < 0.005;
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
  return { data, operacional, coopId: coop.id };
}

function idsOrlando(data: AppData, coopId: string): { canon: string; set: Set<string> } {
  const canon = resolverCooperadoIdCanonico(data, ORLANDO, coopId);
  return { canon, set: new Set([ORLANDO, canon]) };
}

function notaOrlando(nota: NotaPedido, data: AppData, coopId: string, canon: string): boolean {
  return notaEnvolveCooperadoCorrecao(data, nota, ORLANDO, coopId) || notaEnvolveCooperadoCorrecao(data, nota, canon, coopId);
}

function collectNotasAlvo(data: AppData, coopId: string, canon: string): NotaPedido[] {
  const byId = new Map<string, NotaPedido>();
  for (const n of data.notasPedido) {
    if (n.cooperativaId !== coopId) continue;
    if (!notaOrlando(n, data, coopId, canon)) continue;
    if (isValorTeste(n.valorLiquido)) byId.set(n.id, n);
  }
  for (const f of data.fichaCorrida) {
    if (f.cooperativaId !== coopId) continue;
    if (!idsOrlando(data, coopId).set.has(f.cooperadoId)) continue;
    if (!isValorTeste(f.valorLiquido)) continue;
    if (!f.notaPedidoId) continue;
    const n = data.notasPedido.find((x) => x.id === f.notaPedidoId);
    if (n && notaOrlando(n, data, coopId, canon)) byId.set(n.id, n);
  }
  return [...byId.values()];
}

function pagamentoReferenciaNotas(
  data: AppData,
  p: AppData["pagamentosCooperado"][0],
  notaIds: Set<string>
): boolean {
  if ((p.notaPedidoIds ?? []).some((id) => notaIds.has(id))) return true;
  const fichaIds = new Set(p.fichaIds ?? []);
  return data.fichaCorrida.some((f) => fichaIds.has(f.id) && f.notaPedidoId && notaIds.has(f.notaPedidoId));
}

function removerPagamentosTesteNaoPagos(
  data: AppData,
  coopId: string,
  canon: string,
  notaIds: Set<string>
): AppData {
  const ids = idsOrlando(data, coopId).set;
  const pagamentosCooperado = data.pagamentosCooperado.filter((p) => {
    if (p.cooperativaId !== coopId) return true;
    if (!ids.has(p.cooperadoId)) return true;
    if (p.status === "confirmado") return true;
    const ref = pagamentoReferenciaNotas(data, p, notaIds);
    const valorTeste = isValorTeste(p.valorLiquido) || isValorTeste(p.valorLiquido / 2);
    if (p.status === "aguardando_confirmacao" && (ref || valorTeste)) return false;
    return true;
  });
  return { ...data, pagamentosCooperado };
}

function limparValores141Orlando(data: AppData, coopId: string): AppData {
  const { set } = idsOrlando(data, coopId);
  let next = data;
  next = {
    ...next,
    fichaCorrida: next.fichaCorrida.filter(
      (f) => !(f.cooperativaId === coopId && set.has(f.cooperadoId) && isValorTeste(f.valorLiquido))
    ),
    valoresAvulsosReceber: (next.valoresAvulsosReceber ?? []).filter(
      (v) => !(v.cooperativaId === coopId && set.has(v.cooperadoId) && isValorTeste(v.valor))
    ),
    arquivosMensais: next.arquivosMensais.map((a) => ({
      ...a,
      notaPedidoIds: (a.notaPedidoIds ?? []).filter((id) => next.notasPedido.some((n) => n.id === id)),
    })),
  };
  return next;
}

async function main() {
  console.log(`=== Orlando — remover teste R$ ${VALOR_TESTE.toFixed(2)} | APPLY=${APPLY} ===\n`);
  const { data: initial, operacional, coopId } = await loadData();
  const { canon } = idsOrlando(initial, coopId);

  const alvo = collectNotasAlvo(initial, coopId, canon);
  if (alvo.length === 0) {
    console.log("Nenhuma nota Orlando com valor 141,07 encontrada.");
    process.exit(0);
  }

  console.log("Notas alvo:");
  for (const n of alvo) {
    const ex = podeExcluirEntregaNota(initial, n.id, coopId);
    console.log(
      `  ${n.id} | ${n.numeroNota} | ${n.mesReferencia} | ${n.status} | liq=${n.valorLiquido} | excluir=${ex.ok ? "ok" : ex.reason}`
    );
  }

  const antes = getTotalAPagarCooperado(initial, ORLANDO, undefined, coopId);
  console.log("\nTotal a pagar Orlando (antes):", antes);

  if (!APPLY) {
    console.log("\nDry-run — defina APPLY=1 para aplicar na nuvem.");
    return;
  }

  const notaIds = new Set(alvo.map((n) => n.id));
  let data = removerPagamentosTesteNaoPagos(initial, coopId, canon, notaIds);

  const excluidas: string[] = [];
  for (const n of alvo) {
    const r = excluirEntregaNota(data, n.id, coopId);
    if (!r.ok) {
      console.error(`Falha excluir ${n.id}:`, r.reason);
      process.exit(1);
    }
    data = r.data;
    excluidas.push(n.id);
  }

  data = limparValores141Orlando(data, coopId);

  const depois = getTotalAPagarCooperado(data, ORLANDO, undefined, coopId);
  console.log("Total a pagar Orlando (depois):", depois);

  const payload = {
    ...operacional,
    ...buildOperacionalPayloadForTests(data, coopId),
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
  if (up.blockedDowngrades.length) {
    console.warn("Downgrades bloqueados (pagamento confirmado):", up.blockedDowngrades.length);
  }

  for (const notaId of excluidas) {
    const st = await deleteNotaFromStorage(supabase, CNPJ, notaId);
    if (!st.ok) {
      console.error("Falha storage nota", notaId, st.error);
      process.exit(1);
    }
    await deleteNotaFromTable(supabase, CNPJ, notaId);
  }

  console.log(`\nConcluído: ${excluidas.length} entrega(s) removidas, operacional atualizado.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
