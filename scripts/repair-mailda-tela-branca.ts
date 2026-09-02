/**
 * Repara dados da Mailda que bloqueavam o app (mensalidades duplicadas + rascunho órfão).
 * Uso: npx tsx scripts/repair-mailda-tela-branca.ts
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeCnpj } from "../src/utils/cooperativa";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro";
import {
  fetchNotasFromStorage,
  fetchNotasFromTable,
  mergeNotasSources,
  deleteNotaFromStorage,
} from "../src/lib/supabase/notasStorage";
import { fetchOperacionalSync, uploadOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";
import { cooperadoFinanceiroLocalAusente } from "../src/services/fichaSyncGuard";
import type { AppData, Mensalidade } from "../src/types";

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
const MAILDA_ID = "c_1787062473525_7isbg";
const RASCUNHO_ORFAO_ID = "np_1787062863057_zu2s2";

function dedupeMensalidades(mensalidades: Mensalidade[], cooperadoId: string): Mensalidade[] {
  const dela = mensalidades.filter((m) => m.cooperadoId === cooperadoId);
  const outros = mensalidades.filter((m) => m.cooperadoId !== cooperadoId);
  const byMes = new Map<string, Mensalidade>();
  for (const m of dela.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    if (!byMes.has(m.mesReferencia)) byMes.set(m.mesReferencia, m);
  }
  const removidas = dela.length - byMes.size;
  if (removidas > 0) {
    console.log(`Mensalidades duplicadas removidas: ${removidas}`);
    for (const m of dela) {
      if (byMes.get(m.mesReferencia)?.id !== m.id) {
        console.log(`  - ${m.id} (${m.mesReferencia})`);
      }
    }
  }
  return [...outros, ...byMes.values()];
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

  const { data: rows } = await supabase.from("cooperativas").select("*").eq("cnpj", CNPJ);
  const coop = cooperativaFromCloudRow(rows![0] as Record<string, unknown>);

  const [storageNotas, tableResult, operacional] = await Promise.all([
    fetchNotasFromStorage(supabase, CNPJ),
    fetchNotasFromTable(supabase, CNPJ),
    fetchOperacionalSync(supabase, CNPJ),
  ]);

  if (!operacional) {
    console.error("Operacional não encontrado");
    process.exit(1);
  }

  const notas = mergeNotasSources(tableResult.notas, storageNotas);
  const rascunho = notas.find((n) => n.id === RASCUNHO_ORFAO_ID);
  if (rascunho?.status === "rascunho") {
    console.log(`Removendo rascunho órfão ${RASCUNHO_ORFAO_ID} (fotos=${rascunho.fotosEnviadasCount ?? 0}, val=${rascunho.valorLiquido})`);
    const del = await deleteNotaFromStorage(supabase, CNPJ, RASCUNHO_ORFAO_ID);
    if (!del.ok) console.warn("  Aviso storage:", del.error);
    else console.log("  Rascunho removido da nuvem");
  } else {
    console.log("Rascunho órfão já ausente ou alterado — pulando");
  }

  const mensalidadesAntes = operacional.mensalidades?.filter((m) => m.cooperadoId === MAILDA_ID).length ?? 0;
  const mensalidades = dedupeMensalidades(operacional.mensalidades ?? [], MAILDA_ID);
  const mensalidadesDepois = mensalidades.filter((m) => m.cooperadoId === MAILDA_ID).length;
  console.log(`Mensalidades Mailda: ${mensalidadesAntes} → ${mensalidadesDepois}`);

  const payload = {
    ...operacional,
    updatedAt: new Date().toISOString(),
    mensalidades,
  };
  const up = await uploadOperacionalSync(supabase, CNPJ, payload);
  if (!up.ok) {
    console.error("Falha upload operacional:", up.error);
    process.exit(1);
  }

  const data: AppData = {
    cooperativas: [coop],
    users: [],
    cooperados: [{ id: MAILDA_ID, cooperativaId: coop.id, nomeCompleto: "Mailda Rosa de Abreu", cpfCnpj: "81584610263", status: "ativo", createdAt: "", updatedAt: "" }],
    mensalidades,
    cotas: [],
    instituicoes: operacional.instituicoes ?? [],
    produtosInstituicao: operacional.produtosInstituicao ?? [],
    notasPedido: notas.filter((n) => n.id !== RASCUNHO_ORFAO_ID),
    fichaCorrida: operacional.fichaCorrida ?? [],
    pagamentosCooperado: operacional.pagamentosCooperado ?? [],
    arquivosMensais: operacional.arquivosMensais ?? [],
    ajustesFichaMes: operacional.ajustesFichaMes ?? [],
    entregas: [],
    descontos: operacional.descontos ?? [],
    valoresAvulsosReceber: operacional.valoresAvulsosReceber ?? [],
    pagamentos: [],
    financeiro: [],
    comunicados: operacional.comunicados ?? [],
    reclamacoes: [],
    votacaoPautas: operacional.votacaoPautas ?? [],
    votacaoVotos: operacional.votacaoVotos ?? [],
    propriedades: [],
    veiculos: [],
    fechamentos: [],
    livroCaixa: [],
    prestacoesContas: operacional.prestacoesContas ?? [],
    auditLog: [],
    config: operacional.config ?? { descontoPadraoCooperativa: 5 },
  };

  console.log(
    "cooperadoFinanceiroLocalAusente após reparo:",
    cooperadoFinanceiroLocalAusente(data, MAILDA_ID, coop.id)
  );
  console.log("\nConcluído — Mailda pode sair e entrar de novo no app (ou limpar cache se ainda travar).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
