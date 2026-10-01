/**
 * Diagnóstico read-only — paridade fluxo H204 (referência Orlando) para todos os cooperados da cooperativa.
 * npx tsx scripts/audit-cooperado-fluxo-h204-paridade-once.ts [cnpj]
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData } from "../src/types";
import { fetchNotasFromStorage, fetchNotasFromTable, mergeNotasSources } from "../src/lib/supabase/notasStorage";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import { fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro";
import { mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import { resolverCooperadoIdCanonico } from "../src/services/cooperadoCloudService";
import {
  cooperadoFinanceiroDesatualizado,
  cooperadoFinanceiroLocalAusente,
} from "../src/services/fichaSyncGuard";
import {
  cooperadoFluxoApresentacaoPronta,
  fluxoGlobalProibidoReferenciaOrlandoNoCodigo,
  projetarCooperadoFluxoFinanceiroGlobal,
} from "../src/lib/cooperadoFluxoFinanceiroGlobal";

const ORLANDO_REF = "c_1782263929381_ncp55";

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

const CNPJ = (process.argv[2] ?? "62351750000165").replace(/\D/g, "");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configure .env.local");

  const fluxoSrc = readFileSync(resolve(process.cwd(), "src/lib/cooperadoFluxoFinanceiroGlobal.ts"), "utf8");
  const codigoSemExcecaoOrlando = fluxoGlobalProibidoReferenciaOrlandoNoCodigo(fluxoSrc);

  const sb = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });
  const { data: coopRows } = await sb.from("cooperativas").select("*").eq("cnpj", CNPJ);
  if (!coopRows?.length) throw new Error("Cooperativa não encontrada");
  const coop = cooperativaFromCloudRow(coopRows[0] as Record<string, unknown>);

  const [storageNotas, tableResult, cloudCooperados, operacional] = await Promise.all([
    fetchNotasFromStorage(sb, CNPJ),
    fetchNotasFromTable(sb, CNPJ),
    fetchCooperadosFromStorage(sb, CNPJ),
    fetchOperacionalSync(sb, CNPJ),
  ]);

  const notas = mergeNotasSources(tableResult.notas, storageNotas).map((n) => ({
    ...n,
    cooperativaId: n.cooperativaId ?? coop.id,
  }));

  let data: AppData = {
    cooperativas: [coop],
    cooperados: cloudCooperados.map((c) => ({ ...c.cooperado, cooperativaId: coop.id })),
    users: [],
    notasPedido: notas,
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    descontos: [],
    instituicoes: [],
    produtosInstituicao: [],
    config: { descontoPadraoCooperativa: 5 },
    auditLog: [],
  } as AppData;

  if (operacional) data = mergeOperacionalIntoData(data, operacional, coop.id, cloudCooperados);

  const ready = { role: "cooperado" as const, cooperadoPagamentosHydrated: true, syncing: false };
  const syncing = { role: "cooperado" as const, cooperadoPagamentosHydrated: false, syncing: true };

  const orlandoCanon = resolverCooperadoIdCanonico(data, ORLANDO_REF, coop.id);
  const refReady = projetarCooperadoFluxoFinanceiroGlobal(data, orlandoCanon, coop.id, ready);

  type Linha = {
    id: string;
    nome: string;
    canonico: string;
    idCanonicoOk: boolean;
    localAusente: boolean;
    desatualizado: boolean;
    apresentacaoPronta: boolean;
    apresentacaoDuranteSync: boolean;
    painelEstadoReady: string;
    motorValorReady: number;
    mesmoPipelineOrlando: boolean;
  };

  const linhas: Linha[] = [];
  for (const c of data.cooperados.filter((x) => x.cooperativaId === coop.id)) {
    const canon = resolverCooperadoIdCanonico(data, c.id, coop.id);
    const pr = projetarCooperadoFluxoFinanceiroGlobal(data, canon, coop.id, ready);
    const ps = projetarCooperadoFluxoFinanceiroGlobal(data, canon, coop.id, syncing);
    const apresentacaoPronta = cooperadoFluxoApresentacaoPronta(ready);
    const apresentacaoDuranteSync = cooperadoFluxoApresentacaoPronta(syncing);
    linhas.push({
      id: c.id,
      nome: c.nomeCompleto,
      canonico: canon,
      idCanonicoOk: canon === c.id || data.cooperados.some((x) => x.id === canon),
      localAusente: cooperadoFinanceiroLocalAusente(data, canon, coop.id),
      desatualizado: cooperadoFinanceiroDesatualizado(data, canon, coop.id),
      apresentacaoPronta,
      apresentacaoDuranteSync,
      painelEstadoReady: pr.painelEstado,
      motorValorReady: pr.motorValor,
      mesmoPipelineOrlando:
        pr.apresentacaoConsolidada === refReady.apresentacaoConsolidada &&
        ps.apresentacaoConsolidada === false &&
        pr.carregando === refReady.carregando,
    });
  }

  const comProblemaDados = linhas.filter((l) => l.localAusente || l.desatualizado);
  const aliasId = linhas.filter((l) => l.canonico !== l.id);
  const pipelineOk = linhas.every((l) => l.mesmoPipelineOrlando);

  const { data: appUsers } = await sb
    .from("app_users")
    .select("email, cooperado_id, role, active")
    .eq("cooperativa_cnpj", CNPJ)
    .eq("role", "cooperado");

  const cooperadosSemLogin = linhas.filter(
    (l) => !(appUsers ?? []).some((u) => u.cooperado_id === l.id || u.cooperado_id === l.canonico)
  );

  const relatorio = {
    geradoEm: new Date().toISOString(),
    cnpj: CNPJ,
    cooperativa: coop.nome,
    codigoFluxoUniversalSemBranchOrlando: codigoSemExcecaoOrlando,
    referenciaOrlando: { id: orlandoCanon, projReady: refReady },
    totalCooperados: linhas.length,
    pipelineH204IdenticoParaTodos: pipelineOk,
    comSliceFinanceiroAusente: comProblemaDados.filter((x) => x.localAusente).length,
    comFinanceiroDesatualizado: comProblemaDados.filter((x) => x.desatualizado).length,
    idsComAliasCanonico: aliasId.length,
    cooperadosSemAppUser: cooperadosSemLogin.length,
    linhas,
  };

  console.log("\n=== Paridade fluxo H204 — todos os cooperados ===\n");
  console.log(`Cooperativa: ${coop.nome} | cooperados: ${linhas.length}`);
  console.log(`Código sem exceção Orlando no motor: ${codigoSemExcecaoOrlando ? "SIM" : "NÃO"}`);
  console.log(`Pipeline H204 idêntico (ready vs sync): ${pipelineOk ? "SIM" : "NÃO"}`);
  console.log(`Slice ausente: ${relatorio.comSliceFinanceiroAusente} | desatualizado: ${relatorio.comFinanceiroDesatualizado}`);
  console.log(`Alias ID canônico: ${aliasId.length} | sem login app_users: ${cooperadosSemLogin.length}`);

  if (comProblemaDados.length) {
    console.log("\nCooperados com dados locais/nuvem a revisar (fluxo igual, fatia diferente):");
    for (const l of comProblemaDados.slice(0, 12)) {
      console.log(
        `  • ${l.nome.slice(0, 28)} | ausente=${l.localAusente} desat=${l.desatualizado} | motor R$ ${l.motorValorReady.toFixed(2)}`
      );
    }
    if (comProblemaDados.length > 12) console.log(`  … +${comProblemaDados.length - 12}`);
  }

  mkdirSync(resolve(process.cwd(), "backups/auditoria"), { recursive: true });
  const out = resolve(process.cwd(), `backups/auditoria/audit-fluxo-h204-paridade-${CNPJ}-${Date.now()}.json`);
  writeFileSync(out, JSON.stringify(relatorio, null, 2), "utf8");
  console.log("\nJSON:", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
