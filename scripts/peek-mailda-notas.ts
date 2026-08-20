/** Lista notas da cooperada Mailda na nuvem */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import {
  fetchNotasFromStorage,
  fetchNotasFromTable,
  mergeNotasSources,
} from "../src/lib/supabase/notasStorage";
import { fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro";
import { notaPertenceCooperado } from "../src/services/cooperadoCloudService";
import { podeRelancarEntregaNota } from "../src/services/notaPedidoService";
import type { AppData, NotaPedido } from "../src/types";

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

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
    realtime: { transport: ws },
  });
  const { data: rows } = await supabase.from("cooperativas").select("*").eq("cnpj", CNPJ);
  const coop = cooperativaFromCloudRow(rows![0] as Record<string, unknown>);
  const [cloudCooperados, storageNotas, tableResult, operacional] = await Promise.all([
    fetchCooperadosFromStorage(supabase, CNPJ),
    fetchNotasFromStorage(supabase, CNPJ),
    fetchNotasFromTable(supabase, CNPJ),
    fetchOperacionalSync(supabase, CNPJ),
  ]);
  const mailda = cloudCooperados.find((c) => c.nomeCompleto.toLowerCase().includes("mailda"));
  if (!mailda) {
    console.log("Mailda não encontrada");
    return;
  }
  console.log("Cooperada:", mailda.nomeCompleto, mailda.id);

  const notas = mergeNotasSources(tableResult.notas, storageNotas).map((n) => ({
    ...n,
    cooperativaId: n.cooperativaId ?? coop.id,
  }));

  const data: AppData = {
    cooperativas: [coop],
    users: [],
    cooperados: cloudCooperados.map((c) => ({ ...c, cooperativaId: coop.id })),
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

  const dela = notas.filter((n) => notaPertenceCooperado(data, n, mailda.id, coop.id));
  console.log("\nTotal notas Mailda:", dela.length);
  const byStatus = new Map<string, NotaPedido[]>();
  for (const n of dela) {
    const list = byStatus.get(n.status) ?? [];
    list.push(n);
    byStatus.set(n.status, list);
  }
  for (const [st, list] of [...byStatus.entries()].sort()) {
    console.log(`\n--- ${st} (${list.length}) ---`);
    for (const n of list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
      const rel = podeRelancarEntregaNota(data, n.id, coop.id);
      console.log(
        `  ${n.id.slice(0, 24)} | ${n.mesReferencia} | ${n.dataEntrega} | val=${n.valorLiquido} | fotos=${n.fotosEnviadasCount ?? "?"} | relancar=${rel.ok} | ${n.motivoRejeicao?.slice(0, 60) ?? ""}`
      );
    }
  }

  const fichas = (operacional?.fichaCorrida ?? []).filter((f) => f.cooperadoId === mailda.id);
  console.log(`\nFichas operacional: ${fichas.length}`);
  for (const f of fichas) {
    const nota = notas.find((n) => n.id === f.notaPedidoId);
    console.log(`  nota=${f.notaPedidoId.slice(0, 22)} status=${nota?.status ?? "AUSENTE"} val=${f.valorLiquido}`);
  }
}

main().catch(console.error);
