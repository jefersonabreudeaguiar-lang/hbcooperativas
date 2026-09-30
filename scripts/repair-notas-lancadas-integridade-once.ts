/**
 * Normaliza totais das notas lançadas + reconcilia fichas na nuvem.
 * Dry-run: npx tsx scripts/repair-notas-lancadas-integridade-once.ts [cnpj]
 * Aplicar:  $env:APPLY="1"; npx tsx scripts/repair-notas-lancadas-integridade-once.ts [cnpj]
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
import { mergeCloudCooperadosIntoData } from "../src/services/cooperadoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import {
  alinharFichaUnicaComNota,
  alinharSomaFichasComNota,
  fichasDivisaoEntregaConsistentes,
  fichasValoresAlinhadosComNota,
  normalizarTotaisNotaDesdeItens,
  notaTotaisCoerentesComItens,
  reconciliarFichaFromNotasConferidas,
  rebuildFichasNota,
  sincronizarTotaisNotaComFichas,
  consolidarItensDeFichasNota,
  aplicarItensNaNota,
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
  // Notas vêm da tabela/storage (fonte para correção); operacional só traz ficha/pagamentos.
  data = { ...data, notasPedido: notas };
  return { data, operacional, coopId: coop.id };
}

function notaMudou(a: NotaPedido, b: NotaPedido): boolean {
  return (
    a.valorBruto !== b.valorBruto ||
    a.valorDesconto !== b.valorDesconto ||
    a.valorLiquido !== b.valorLiquido ||
    JSON.stringify(a.itens) !== JSON.stringify(b.itens)
  );
}

function corrigirNotaFicha(data: AppData, nota: NotaPedido) {
  if (nota.status !== "conferida" && nota.status !== "pago") {
    return { data, notaPatch: undefined as NotaPedido | undefined, fichaChanged: false };
  }
  const fichas = data.fichaCorrida.filter((f) => f.notaPedidoId === nota.id);
  let base = normalizarTotaisNotaDesdeItens(nota);
  const semItens = !(base.itens ?? []).some((i) => (i.quantidade ?? 0) > 0);
  if (semItens && fichas.length > 0) {
    base = sincronizarTotaisNotaComFichas(base, fichas, {
      sincronizarItens: true,
      forcarDescontoLiquido: true,
      sincronizarBruto: true,
    });
    const aindaSemItens = !(base.itens ?? []).some((i) => (i.quantidade ?? 0) > 0);
    if (aindaSemItens) {
      const itensFicha = consolidarItensDeFichasNota(fichas, nota.id);
      if (itensFicha.length > 0) {
        base = aplicarItensNaNota(base, itensFicha, base.percentualDescontoCooperativa ?? 0);
      }
    }
    base = normalizarTotaisNotaDesdeItens(base);
  }
  if (!fichas.length) {
    return {
      data,
      notaPatch: notaMudou(nota, base) ? base : undefined,
      fichaChanged: false,
    };
  }
  let fichaCorrida = alinharSomaFichasComNota(alinharFichaUnicaComNota(data.fichaCorrida, base), base);
  if (!fichasValoresAlinhadosComNota(fichaCorrida, base)) {
    const rebuilt = rebuildFichasNota({ ...data, fichaCorrida }, base);
    fichaCorrida = rebuilt.fichaCorrida;
  }
  const fichaChanged = fichaCorrida !== data.fichaCorrida;
  return {
    data: fichaChanged ? { ...data, fichaCorrida } : data,
    notaPatch: notaMudou(nota, base) ? base : undefined,
    fichaChanged,
  };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });
  console.log(`=== Reparo notas lançadas (totais × itens × ficha) | APPLY=${APPLY} | CNPJ ${CNPJ} ===\n`);

  const { data: initial, operacional, coopId } = await loadData(supabase);
  const lancadas = initial.notasPedido.filter((n) => n.status === "conferida" || n.status === "pago");

  let antesIncoerentes = initial.notasPedido.filter(
    (n) =>
      (n.status === "conferida" || n.status === "pago") &&
      (n.itens ?? []).some((i) => (i.quantidade ?? 0) > 0) &&
      !notaTotaisCoerentesComItens(n)
  ).length;
  console.log(`Notas conferidas/pagas: ${lancadas.length} | incoerentes (totais×itens): ${antesIncoerentes}`);

  let data = initial;
  const notasPatch = new Map<string, NotaPedido>();
  let fichaTouches = 0;

  for (const nota of lancadas) {
    const { data: d2, notaPatch, fichaChanged } = corrigirNotaFicha(data, nota);
    data = d2;
    if (fichaChanged) fichaTouches++;
    if (notaPatch) {
      notasPatch.set(nota.id, notaPatch);
      console.log(
        `  NOTA ${nota.numeroNota ?? nota.id.slice(-12)} | ${nota.cooperadoNomeSnapshot?.split(" ")[0] ?? "—"} | líq ${nota.valorLiquido.toFixed(2)} → ${notaPatch.valorLiquido.toFixed(2)}`
      );
    }
  }

  if (notasPatch.size > 0) {
    data = {
      ...data,
      notasPedido: data.notasPedido.map((n) => notasPatch.get(n.id) ?? n),
    };
  }

  data = reconciliarFichaFromNotasConferidas(data);

  const divisaoQuebrada = lancadas.filter((n) => {
    const cur = data.notasPedido.find((x) => x.id === n.id)!;
    const parts = cur.divisaoEntrega?.participantes.length ?? 0;
    return parts > 1 && !fichasDivisaoEntregaConsistentes(data, data.fichaCorrida, cur);
  }).length;

  const notasAlteradas = data.notasPedido.filter((n) => {
    if (n.status !== "conferida" && n.status !== "pago") return false;
    const orig = initial.notasPedido.find((o) => o.id === n.id);
    return orig && JSON.stringify(orig) !== JSON.stringify(n);
  });

  const depoisIncoerentes = data.notasPedido.filter(
    (n) =>
      (n.status === "conferida" || n.status === "pago") &&
      (n.itens ?? []).some((i) => (i.quantidade ?? 0) > 0) &&
      !notaTotaisCoerentesComItens(n)
  ).length;

  const fichaDesalinhada = lancadas.filter((n) => {
    const cur = data.notasPedido.find((x) => x.id === n.id)!;
    return !fichasValoresAlinhadosComNota(data.fichaCorrida, cur);
  }).length;

  const operacionalChanged =
    fichaTouches > 0 ||
    JSON.stringify(data.fichaCorrida) !== JSON.stringify(initial.fichaCorrida) ||
    JSON.stringify(data.arquivosMensais) !== JSON.stringify(initial.arquivosMensais) ||
    JSON.stringify(data.notasPedido) !== JSON.stringify(initial.notasPedido);

  console.log(`\nApós reconciliar: incoerentes ${depoisIncoerentes} | nota×ficha desalinhadas ${fichaDesalinhada} | divisão inconsistente ${divisaoQuebrada}`);
  console.log(`Notas a gravar: ${notasAlteradas.length} | operacional alterado: ${operacionalChanged}`);

  if (notasAlteradas.length === 0 && !operacionalChanged) {
    console.log("\nNada a enviar.");
    return;
  }

  if (!APPLY) {
    console.log("\nDry-run — defina APPLY=1 para gravar na nuvem.");
    return;
  }

  mkdirSync(resolve(process.cwd(), "scripts/backups"), { recursive: true });
  const backupPath = resolve(
    process.cwd(),
    `scripts/backups/repair-notas-lancadas-${CNPJ}-${Date.now()}.json`
  );
  writeFileSync(
    backupPath,
    JSON.stringify({ operacional, notas: notasAlteradas }, null, 2)
  );
  console.log("\nBackup:", backupPath);

  for (const nota of notasAlteradas) {
    const payload = notaPayloadForTable(nota);
    const table = await upsertNotasInTable(supabase, CNPJ, [payload], nota.cooperadoNomeSnapshot);
    if (!table.ok && !table.tableMissing) throw new Error(table.error ?? "upsert tabela");
    const storage = await uploadNotaToStorage(supabase, CNPJ, payload, nota.cooperadoNomeSnapshot);
    if (!storage.ok) throw new Error(storage.error ?? "upload storage");
  }

  if (operacionalChanged) {
    const payload = {
      ...operacional,
      updatedAt: new Date().toISOString(),
      fichaCorrida: data.fichaCorrida.filter((f) => f.cooperativaId === coopId),
      arquivosMensais: data.arquivosMensais.filter((a) => a.cooperativaId === coopId),
    };
    const up = await uploadOperacionalSync(supabase, CNPJ, payload);
    if (!up.ok) throw new Error(up.error ?? "upload operacional");
  }

  console.log("\n✓ Nuvem atualizada. Rode: npx tsx scripts/audit-todos-relatorios-alinhamento.ts", CNPJ);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
