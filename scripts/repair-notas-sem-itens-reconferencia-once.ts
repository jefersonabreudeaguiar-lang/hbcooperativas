/**
 * Notas sem itens (linhas vazias): reconstrói a partir da ficha ou devolve à fila Conferir entregas.
 * Dry-run: npx tsx scripts/repair-notas-sem-itens-reconferencia-once.ts [cnpj]
 * Aplicar:  $env:APPLY="1"; npx tsx scripts/repair-notas-sem-itens-reconferencia-once.ts [cnpj]
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
  aplicarItensNaNota,
  consolidarItensDeFichasNota,
  normalizarTotaisNotaDesdeItens,
  podeRelancarEntregaNota,
  reconciliarFichaFromNotasConferidas,
  relancarEntregaNota,
  sincronizarTotaisNotaComFichas,
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

function notaSemItensUtil(n: NotaPedido): boolean {
  if (n.status === "rascunho" || n.status === "rejeitada") return false;
  return !(n.itens ?? []).some((i) => (i.quantidade ?? 0) > 0);
}

function tentarReporItensDaFicha(data: AppData, nota: NotaPedido): NotaPedido | undefined {
  const fichas = data.fichaCorrida.filter((f) => f.notaPedidoId === nota.id);
  if (!fichas.length) return undefined;
  let base = normalizarTotaisNotaDesdeItens(nota);
  base = sincronizarTotaisNotaComFichas(base, fichas, {
    sincronizarItens: true,
    forcarDescontoLiquido: true,
    sincronizarBruto: true,
  });
  const itensFicha = consolidarItensDeFichasNota(fichas, nota.id);
  if (itensFicha.length > 0) {
    base = aplicarItensNaNota(base, itensFicha, base.percentualDescontoCooperativa ?? 0);
  }
  base = normalizarTotaisNotaDesdeItens(base);
  if ((base.itens ?? []).some((i) => (i.quantidade ?? 0) > 0)) return base;
  return undefined;
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
  data = { ...data, notasPedido: notas };
  return { data, operacional, coopId: coop.id };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });
  console.log(`=== Reparo notas sem itens → conferência | APPLY=${APPLY} | CNPJ ${CNPJ} ===\n`);

  const { data: initial, operacional, coopId } = await loadData(supabase);
  const alvos = initial.notasPedido.filter(notaSemItensUtil);
  console.log(`Notas sem itens (exc. rascunho/rejeitada): ${alvos.length}\n`);

  let data = initial;
  const notasGravar = new Map<string, NotaPedido>();
  let repostos = 0;
  let relancados = 0;
  let bloqueados = 0;

  for (const nota of alvos) {
    const reposto = tentarReporItensDaFicha(data, nota);
    if (reposto) {
      repostos++;
      notasGravar.set(nota.id, reposto);
      data = {
        ...data,
        notasPedido: data.notasPedido.map((n) => (n.id === nota.id ? reposto : n)),
      };
      console.log(`  ITENS da ficha | ${nota.cooperadoNomeSnapshot ?? nota.cooperadoId} | ${nota.mesReferencia} | ${nota.id.slice(-14)}`);
      continue;
    }

    if (nota.status === "conferida") {
      const check = podeRelancarEntregaNota(data, nota.id, coopId);
      if (!check.ok) {
        bloqueados++;
        console.log(`  BLOQUEADO relançar | ${nota.status} | ${check.reason} | ${nota.cooperadoNomeSnapshot} | ${nota.id.slice(-14)}`);
        continue;
      }
      const rel = relancarEntregaNota(data, nota.id, coopId);
      if (!rel.ok) {
        bloqueados++;
        console.log(`  FALHA relançar | ${rel.reason} | ${nota.id.slice(-14)}`);
        continue;
      }
      relancados++;
      data = rel.data;
      notasGravar.set(nota.id, rel.nota);
      console.log(`  → aguardando_conferencia | ${nota.cooperadoNomeSnapshot} | ${nota.mesReferencia} | ${nota.id.slice(-14)}`);
      continue;
    }

    if (nota.status === "aguardando_conferencia" || nota.status === "entregue") {
      console.log(`  já na fila (${nota.status}) | ${nota.cooperadoNomeSnapshot} | bruto ${nota.valorBruto.toFixed(2)}`);
      continue;
    }

    bloqueados++;
    console.log(`  SEM AÇÃO | status=${nota.status} | ${nota.cooperadoNomeSnapshot} | ${nota.id.slice(-14)}`);
  }

  data = reconciliarFichaFromNotasConferidas(data);
  const operacionalChanged =
    JSON.stringify(data.fichaCorrida) !== JSON.stringify(initial.fichaCorrida) ||
    JSON.stringify(data.arquivosMensais) !== JSON.stringify(initial.arquivosMensais);

  console.log(`\nRepostos com itens: ${repostos} | Relançados conferência: ${relancados} | Bloqueados: ${bloqueados}`);
  console.log(`Notas a gravar: ${notasGravar.size} | operacional alterado: ${operacionalChanged}`);

  if (notasGravar.size === 0 && !operacionalChanged) {
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
    `scripts/backups/repair-notas-sem-itens-${CNPJ}-${Date.now()}.json`
  );
  writeFileSync(
    backupPath,
    JSON.stringify({ operacional, notas: [...notasGravar.values()] }, null, 2)
  );
  console.log("\nBackup:", backupPath);

  for (const nota of notasGravar.values()) {
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

  console.log("\n✓ Nuvem atualizada.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
