/**
 * Audita votos na nuvem vs placar que o responsável vê (getResumoPauta).
 * Uso: npx tsx scripts/audit-votacao-placar-responsavel.ts [cnpj]
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData, VotacaoVoto } from "../src/types";
import { normalizeCnpj } from "../src/utils/cooperativa";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import { fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";
import {
  listCooperadosDaCooperativa,
  mergeCloudCooperadosIntoData,
  resolverCooperadoIdCanonico,
} from "../src/services/cooperadoCloudService";
import { mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import {
  cooperadoJaVotou,
  getResumoPauta,
  listarVotosPauta,
  listarPautasCooperativa,
} from "../src/services/votacaoService";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnvFile(resolve(process.cwd(), ".env.local"));

const CNPJ = normalizeCnpj(process.argv[2] ?? "62351750000165");

function votosValidosPauta(votos: VotacaoVoto[], pautaId: string, reabertoEm?: string): VotacaoVoto[] {
  const reabertoMs = reabertoEm ? new Date(reabertoEm).getTime() : 0;
  return votos.filter((v) => {
    if (v.pautaId !== pautaId) return false;
    if (reabertoMs && new Date(v.createdAt).getTime() < reabertoMs) return false;
    return true;
  });
}

function dedupePorCooperadoCanonico(
  data: AppData,
  coopId: string,
  votos: VotacaoVoto[]
): Map<string, VotacaoVoto> {
  const map = new Map<string, VotacaoVoto>();
  for (const v of votos) {
    const canon = resolverCooperadoIdCanonico(data, v.cooperadoId, coopId);
    const prev = map.get(canon);
    if (!prev || new Date(v.createdAt).getTime() >= new Date(prev.createdAt).getTime()) {
      map.set(canon, { ...v, cooperadoId: canon });
    }
  }
  return map;
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { realtime: { transport: ws } }
  );

  const { data: coopRow } = await sb.from("cooperativas").select("*").eq("cnpj", CNPJ).maybeSingle();
  const coop = coopRow ? cooperativaFromCloudRow(coopRow) : null;
  if (!coop) {
    console.error("Cooperativa não encontrada:", CNPJ);
    process.exit(1);
  }

  const operacional = await fetchOperacionalSync(sb, CNPJ);
  if (!operacional) {
    console.error("operacional.json ausente");
    process.exit(1);
  }

  const cloudCooperados = await fetchCooperadosFromStorage(sb, CNPJ);
  let data: AppData = {
    cooperativas: [coop],
    cooperados: [],
    users: [],
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
    votacaoPautas: operacional.votacaoPautas ?? [],
    votacaoVotos: operacional.votacaoVotos ?? [],
    propriedades: [],
    veiculos: [],
    fechamentos: [],
    livroCaixa: [],
    prestacoesContas: [],
    auditLog: [],
    config: operacional.config ?? { descontoPadraoCooperativa: 5 },
  };
  data = mergeCloudCooperadosIntoData(data, cloudCooperados, CNPJ, coop.id);
  data = mergeOperacionalIntoData(data, operacional, coop.id, cloudCooperados);

  const rawCloudVotos = operacional.votacaoVotos ?? [];
  const pautas = listarPautasCooperativa(data, coop.id);
  const abertas = pautas.filter((p) => p.status === "aberta");

  console.log(`\n=== Auditoria votação — ${coop.nome} (${CNPJ}) ===\n`);
  console.log(`Votos brutos na nuvem: ${rawCloudVotos.length}`);
  console.log(`Pautas abertas: ${abertas.length}`);

  if (abertas.length === 0) {
    console.log("\nNenhuma pauta aberta no momento.");
    for (const p of pautas.slice(0, 5)) {
      const resumo = getResumoPauta(data, p.id, coop.id);
      console.log(`\n[${p.status}] ${p.texto.slice(0, 60)}… → ${resumo.totalVotos} voto(s) no placar`);
    }
    return;
  }

  const issues: string[] = [];

  for (const pauta of abertas) {
    console.log(`\n--- PAUTA ABERTA ---`);
    console.log(`ID: ${pauta.id}`);
    console.log(`Texto: ${pauta.texto.slice(0, 100)}${pauta.texto.length > 100 ? "…" : ""}`);
    console.log(`Período: ${pauta.inicioEm} → ${pauta.fimEm}`);
    if (pauta.votosReabertosEm) {
      console.log(`Reaberta em: ${pauta.votosReabertosEm}`);
    }

    const validosNuvem = votosValidosPauta(rawCloudVotos, pauta.id, pauta.votosReabertosEm);
    const dedupeNuvem = dedupePorCooperadoCanonico(data, coop.id, validosNuvem);
    const resumo = getResumoPauta(data, pauta.id, coop.id);
    const listados = listarVotosPauta(data, pauta.id, coop.id);

    console.log(`\nNuvem (válidos pós-reabertura): ${validosNuvem.length} registro(s), ${dedupeNuvem.size} cooperado(s) únicos`);
    console.log(`Placar responsável (getResumoPauta): ${resumo.totalVotos} voto(s)`);
    console.log(`  SIM=${resumo.votosSim} NÃO=${resumo.votosNao} ABST=${resumo.votosAbstencao}`);
    console.log(`  Pendentes: ${resumo.pendentes.length} | Elegíveis: ${resumo.totalElegiveis}`);

    if (dedupeNuvem.size !== resumo.totalVotos) {
      issues.push(
        `Pauta ${pauta.id}: nuvem tem ${dedupeNuvem.size} voto(s) únicos mas placar mostra ${resumo.totalVotos}`
      );
    }

    console.log(`\nVotos na nuvem (válidos):`);
    for (const v of validosNuvem) {
      const canon = resolverCooperadoIdCanonico(data, v.cooperadoId, coop.id);
      const noPlacar = listados.some(
        (l) => l.cooperadoId === v.cooperadoId || l.cooperadoId === canon
      );
      const flag = noPlacar ? "✓" : "✗ FALTA NO PLACAR";
      console.log(
        `  ${flag} ${v.cooperadoNome} (${v.cooperadoId}) → ${v.voto} @ ${v.createdAt}${canon !== v.cooperadoId ? ` [canon=${canon}]` : ""}`
      );
      if (!noPlacar) {
        issues.push(`Voto de ${v.cooperadoNome} (${v.cooperadoId}) não aparece no placar`);
      }
    }

    console.log(`\nVotos no placar (listarVotosPauta):`);
    for (const v of listados) {
      const canon = resolverCooperadoIdCanonico(data, v.cooperadoId, coop.id);
      const validoPosReabertura = !pauta.votosReabertosEm ||
        new Date(v.createdAt).getTime() >= new Date(pauta.votosReabertosEm).getTime();
      const fantasma = !validoPosReabertura;
      console.log(
        `  ${fantasma ? "⚠ fantasma (pré-reabertura)" : "✓"} ${v.cooperadoNome} → ${v.voto} @ ${v.createdAt}`
      );
      if (fantasma) {
        issues.push(`Placar inclui voto pré-reabertura de ${v.cooperadoNome} (deveria ignorar)`);
      }
    }

    const elegiveis = listCooperadosDaCooperativa(data, coop.id).filter((c) => c.status === "ativo");
    console.log(`\nCooperados elegíveis que votaram (cooperadoJaVotou):`);
    for (const c of elegiveis) {
      const canon = resolverCooperadoIdCanonico(data, c.id, coop.id);
      const jaVotou = cooperadoJaVotou(data, pauta.id, canon, coop.id);
      const naNuvem = dedupeNuvem.has(canon) || validosNuvem.some((v) => v.cooperadoId === c.id);
      if (jaVotou || naNuvem) {
        const noPlacar = listados.some((l) => resolverCooperadoIdCanonico(data, l.cooperadoId, coop.id) === canon);
        console.log(
          `  ${c.nomeCompleto}: jaVotou=${jaVotou} nuvem=${naNuvem} placar=${noPlacar}${!noPlacar && naNuvem ? " ← PROBLEMA" : ""}`
        );
        if (naNuvem && !noPlacar) {
          issues.push(`${c.nomeCompleto} tem voto na nuvem mas não no placar`);
        }
      }
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  if (issues.length === 0) {
    console.log("✅ Nenhuma divergência entre nuvem e placar do responsável.");
  } else {
    console.log(`⚠ ${issues.length} problema(s) encontrado(s):`);
    for (const i of issues) console.log(`  - ${i}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
