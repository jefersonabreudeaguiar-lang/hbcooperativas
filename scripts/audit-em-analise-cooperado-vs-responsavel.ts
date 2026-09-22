/**
 * Cooperados com entrega/assinatura "em análise" na nuvem vs o que o responsável veria após sync.
 * Uso: npx tsx scripts/audit-em-analise-cooperado-vs-responsavel.ts [--cnpj=62351750000165]
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData, Cooperado, NotaPedido } from "../src/types";
import {
  fetchNotasFromStorage,
  fetchNotasFromTable,
  mergeNotasSources,
} from "../src/lib/supabase/notasStorage";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro";
import { mergeCloudCooperadosIntoData } from "../src/services/cooperadoCloudService";
import {
  getAssinaturaCadastroStatus,
  mergeDuplicatasAssinaturaNaLista,
  resumoAssinaturaCadastroApp,
} from "../src/services/cooperadoAssinaturaService";
import { isNotaNaFilaConferenciaResponsavel } from "../src/utils/notaStatus";
import { notaPertenceCooperativa } from "../src/utils/fotoEntrega";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));

const cnpjArg = process.argv.find((a) => a.startsWith("--cnpj="));
const CNPJ = cnpjArg?.split("=")[1]?.replace(/\D/g, "") ?? "62351750000165";

type RowIssue = {
  tipo: "nota" | "assinatura_cadastro";
  cooperadoId: string;
  nome: string;
  detalhe: string;
  notaId?: string;
  mes?: string;
  cloudStatus?: string;
  sqlStatus?: string;
  storageStatus?: string;
  motivo: string;
};

function nomeCoop(data: AppData, id: string): string {
  return data.cooperados.find((c) => c.id === id)?.nomeCompleto ?? id;
}

async function loadTableRowsRaw(
  sb: ReturnType<typeof createClient>,
  cnpj: string
): Promise<Map<string, { status: string; updated_at: string }>> {
  const map = new Map<string, { status: string; updated_at: string }>();
  const { data, error } = await sb
    .from("notas_pedido")
    .select("id, status, updated_at")
    .eq("cooperativa_cnpj", cnpj);
  if (error) {
    console.warn("[sql] notas_pedido:", error.message);
    return map;
  }
  for (const row of data ?? []) {
    if (row.id) map.set(String(row.id), { status: String(row.status ?? ""), updated_at: String(row.updated_at ?? "") });
  }
  return map;
}

function notaEnviadaPeloCooperado(n: NotaPedido): boolean {
  return (
    n.status === "aguardando_conferencia" ||
    n.status === "entregue" ||
    Boolean(n.assinaturaRecebedor?.trim()) ||
    Boolean(n.enviadaEm) ||
    (n.fotosEnviadasCount ?? 0) > 0 ||
    Boolean(n.fotoNaNuvem)
  );
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local");
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });

  const { data: coopRows } = await sb.from("cooperativas").select("*").eq("cnpj", CNPJ);
  if (!coopRows?.length) {
    console.error("Cooperativa não encontrada:", CNPJ);
    process.exit(1);
  }
  const coop = cooperativaFromCloudRow(coopRows[0] as Record<string, unknown>);

  const [storageNotas, tableResult, cloudCooperados, sqlMeta, storageNotasOnly] = await Promise.all([
    fetchNotasFromStorage(sb, CNPJ),
    fetchNotasFromTable(sb, CNPJ),
    fetchCooperadosFromStorage(sb, CNPJ),
    loadTableRowsRaw(sb, CNPJ),
    fetchNotasFromStorage(sb, CNPJ),
  ]);

  const tableNotas = tableResult.notas;
  const mergedNotas = mergeNotasSources(tableNotas, storageNotas);

  let data: AppData = {
    cooperativas: [coop],
    cooperados: [],
    users: [],
    notasPedido: mergedNotas,
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    instituicoes: [],
    produtosInstituicao: [],
    descontos: [],
    config: {},
  } as AppData;
  data = mergeCloudCooperadosIntoData(data, cloudCooperados, CNPJ, coop.id);

  const issues: RowIssue[] = [];
  const byCooperadoNotas = new Map<string, NotaPedido[]>();

  const storageById = new Map(storageNotasOnly.map((n) => [n.id, n]));
  const tableById = new Map(tableNotas.map((n) => [n.id, n]));

  for (const n of mergedNotas) {
    if (!notaEnviadaPeloCooperado(n)) continue;
    const stMerged = n.status;
    const stStorage = storageById.get(n.id)?.status;
    const stTablePayload = tableById.get(n.id)?.status;
    const stSqlCol = sqlMeta.get(n.id)?.status;

    const naFilaResponsavel =
      isNotaNaFilaConferenciaResponsavel(stMerged) && notaPertenceCooperativa(data, n, coop.id);

    const cooperadoKey = n.cooperadoId;
    const list = byCooperadoNotas.get(cooperadoKey) ?? [];
    list.push(n);
    byCooperadoNotas.set(cooperadoKey, list);

    if (stMerged === "aguardando_conferencia" || stMerged === "entregue") {
      if (!naFilaResponsavel) {
        issues.push({
          tipo: "nota",
          cooperadoId: cooperadoKey,
          nome: n.cooperadoNomeSnapshot?.trim() || nomeCoop(data, cooperadoKey),
          notaId: n.id,
          mes: n.mesReferencia,
          cloudStatus: stMerged,
          sqlStatus: stSqlCol,
          storageStatus: stStorage,
          detalhe: `merged=${stMerged} sqlCol=${stSqlCol ?? "—"} storage=${stStorage ?? "—"} tablePayload=${stTablePayload ?? "—"}`,
          motivo: !notaPertenceCooperativa(data, n, coop.id)
            ? "cooperativaId/CNPJ da nota não bate com a cooperativa"
            : "status merged fora da fila do responsável",
        });
      }

      const filaSqlOk =
        stSqlCol === "aguardando_conferencia" || stSqlCol === "entregue" || !sqlMeta.has(n.id);
      if (naFilaResponsavel && sqlMeta.has(n.id) && !filaSqlOk) {
        issues.push({
          tipo: "nota",
          cooperadoId: cooperadoKey,
          nome: n.cooperadoNomeSnapshot?.trim() || nomeCoop(data, cooperadoKey),
          notaId: n.id,
          mes: n.mesReferencia,
          cloudStatus: stMerged,
          sqlStatus: stSqlCol,
          storageStatus: stStorage,
          detalhe: "Responsável em delta sync pode não puxar (coluna SQL fora da fila)",
          motivo: `SQL status "${stSqlCol}" ≠ aguardando/entregue — query fila do sync ignora`,
        });
      }

      if (!sqlMeta.has(n.id) && stStorage && isNotaNaFilaConferenciaResponsavel(stStorage)) {
        issues.push({
          tipo: "nota",
          cooperadoId: cooperadoKey,
          nome: n.cooperadoNomeSnapshot?.trim() || nomeCoop(data, cooperadoKey),
          notaId: n.id,
          mes: n.mesReferencia,
          cloudStatus: stMerged,
          storageStatus: stStorage,
          detalhe: "Nota só no storage JSON, sem linha notas_pedido",
          motivo: "sync delta do responsável depende da tabela SQL + fila fixa",
        });
      }
    } else if (stStorage === "aguardando_conferencia" || stStorage === "entregue") {
      issues.push({
        tipo: "nota",
        cooperadoId: cooperadoKey,
        nome: n.cooperadoNomeSnapshot?.trim() || nomeCoop(data, cooperadoKey),
        notaId: n.id,
        mes: n.mesReferencia,
        cloudStatus: stMerged,
        sqlStatus: stSqlCol,
        storageStatus: stStorage,
        detalhe: `Cooperado veria em análise no storage; merge virou ${stMerged}`,
        motivo: "merge SQL/payload rebaixou ou sobrescreveu status da fila",
      });
    }
  }

  // Assinaturas de cadastro em_analise na nuvem
  const cloudAtivos = cloudCooperados.filter((c) => c.status === "ativo" && !c.avulso);
  const emAnaliseCloud = cloudAtivos.filter((c) => getAssinaturaCadastroStatus(c) === "em_analise");

  data = mergeCloudCooperadosIntoData(
    { ...data, cooperados: [] } as AppData,
    cloudCooperados,
    CNPJ,
    coop.id
  );
  const resumo = resumoAssinaturaCadastroApp(data, coop.id);
  const idsNaListaResp = new Set(resumo.listaEmAnalise.map((c) => c.id));

  for (const c of emAnaliseCloud) {
    const apareceResp = idsNaListaResp.has(c.id);
    const dupes = cloudAtivos.filter(
      (x) =>
        x.id !== c.id &&
        (x.cpfCnpj?.replace(/\D/g, "") === c.cpfCnpj?.replace(/\D/g, "") ||
          x.nomeCompleto.trim().toLowerCase() === c.nomeCompleto.trim().toLowerCase())
    );
    if (!apareceResp) {
      const canon = mergeDuplicatasAssinaturaNaLista([c, ...dupes])[0];
      const canonAparece = resumo.listaEmAnalise.some((r) => r.id === canon?.id);
      issues.push({
        tipo: "assinatura_cadastro",
        cooperadoId: c.id,
        nome: c.nomeCompleto,
        detalhe: `enviadaEm=${c.assinaturaCadastradaEm ?? "—"} canon=${canon?.id ?? "?"}`,
        motivo: canonAparece
          ? "ID duplicado — responsável vê outro registro canônico"
          : "em_analise na nuvem mas fora de listaEmAnalise após merge/dedupe local simulado",
      });
    }
  }

  // Cooperados com notas em análise (agrupado)
  const coopComNotaAnalise = [...byCooperadoNotas.entries()]
    .map(([id, notas]) => ({
      id,
      nome: notas[0]?.cooperadoNomeSnapshot?.trim() || nomeCoop(data, id),
      notas: notas.filter((n) => n.status === "aguardando_conferencia" || n.status === "entregue"),
    }))
    .filter((x) => x.notas.length > 0)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  console.log(`\n=== Auditoria em análise — CNPJ ${CNPJ} (${coop.nome}) ===\n`);
  console.log(`Notas merged em fila (aguardando/entregue): ${mergedNotas.filter((n) => isNotaNaFilaConferenciaResponsavel(n.status)).length}`);
  console.log(`Cooperados com ≥1 nota em fila: ${coopComNotaAnalise.length}`);
  console.log(`Assinaturas cadastro em_analise (nuvem): ${emAnaliseCloud.length}`);
  console.log(`Assinaturas em_analise (painel responsável simulado): ${resumo.emAnalise}`);
  console.log(`Problemas detectados: ${issues.length}\n`);

  if (emAnaliseCloud.length) {
    console.log("--- Assinaturas cadastro em_analise (nuvem) ---");
    for (const c of emAnaliseCloud.sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR"))) {
      const ok = idsNaListaResp.has(c.id) || resumo.listaEmAnalise.some((r) => r.nomeCompleto === c.nomeCompleto);
      console.log(`  ${ok ? "OK" : "FALTA"} | ${c.nomeCompleto} | ${c.id} | ${c.assinaturaCadastradaEm ?? ""}`);
    }
    console.log("");
  }

  if (issues.length) {
    console.log("--- Problemas (nota ou assinatura) ---");
    const byNome = new Map<string, RowIssue[]>();
    for (const i of issues) {
      const k = `${i.tipo}:${i.nome}`;
      byNome.set(k, [...(byNome.get(k) ?? []), i]);
    }
    for (const [k, rows] of [...byNome.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))) {
      console.log(`\n${k}`);
      for (const r of rows) {
        console.log(`  • ${r.motivo}`);
        console.log(`    ${r.detalhe}${r.notaId ? ` | nota …${r.notaId.slice(-8)}` : ""}${r.mes ? ` | ${r.mes}` : ""}`);
      }
    }
  } else {
    console.log("Nenhuma inconsistência nuvem→fila responsável encontrada neste snapshot.");
    console.log("(Se o responsável ainda não vê, pode ser cache local no aparelho — peça sync ou reinstalar PWA.)");
  }

  console.log("\n--- Cooperados com entregas em análise (merged) ---");
  for (const row of coopComNotaAnalise) {
    const prob = issues.filter((i) => i.tipo === "nota" && i.cooperadoId === row.id);
    console.log(
      `  ${prob.length ? "⚠" : "✓"} ${row.nome} (${row.notas.length} nota(s))${prob.length ? ` — ${prob.length} alerta(s)` : ""}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
