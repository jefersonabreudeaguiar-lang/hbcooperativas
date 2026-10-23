/**
 * Nomes na fila Conferir — readonly nuvem (piloto).
 * npx tsx scripts/_diag-conferir-nomes-nuvem-once.ts [cnpj]
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro";
import { fetchNotasFromTable, fetchNotasFromStorage, mergeNotasSources } from "../src/lib/supabase/notasStorage";
import { fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import { normalizeCnpj } from "../src/utils/cooperativa";
import { isNotaNaFilaConferenciaResponsavel } from "../src/utils/notaStatus";
import {
  appDataParaConferirLeitura,
  listNotasFilaConferenciaResponsavel,
  resetResponsavelPainelIndexCache,
} from "../src/services/responsavelPainelIndex";
import {
  agruparPendentesPorCooperado,
  getNomeEnvioEntregaNota,
  nomeCooperadoSnapshotUtilizavel,
} from "../src/utils/fotoEntrega";
import type { AppData, Cooperado, User } from "../src/types";

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

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });

  const { data: rows } = await sb.from("cooperativas").select("*").eq("cnpj", CNPJ);
  const coop = cooperativaFromCloudRow(rows![0] as Record<string, unknown>);
  const coopId = coop.id;

  const { data: coopUsers } = await sb
    .from("usuarios_cooperativa")
    .select("id, nome, email, papel, cooperado_id, ativo")
    .eq("cooperativa_id", coopId);

  const [tableResult, storageNotas, operacional, cooperadosStorage] = await Promise.all([
    fetchNotasFromTable(sb, CNPJ),
    fetchNotasFromStorage(sb, CNPJ),
    fetchOperacionalSync(sb, CNPJ),
    fetchCooperadosFromStorage(sb, CNPJ),
  ]);
  const notas = mergeNotasSources(tableResult.notas, storageNotas);

  const users: User[] = (coopUsers ?? []).map((u) => ({
    id: String(u.id),
    name: String(u.nome ?? ""),
    email: String(u.email ?? ""),
    role: (u.papel as User["role"]) ?? "cooperado",
    cooperadoId: u.cooperado_id ? String(u.cooperado_id) : undefined,
    active: Boolean(u.ativo ?? true),
    passwordHash: "",
    createdAt: "",
    updatedAt: "",
  }));

  const cooperados: Cooperado[] = cooperadosStorage.filter((c) => c.cooperativaId === coopId);

  const data: AppData = {
    cooperativas: [coop],
    users,
    cooperados,
    notasPedido: notas,
    fichaCorrida: operacional?.fichaCorrida ?? [],
    pagamentosCooperado: operacional?.pagamentosCooperado ?? [],
    mensalidades: operacional?.mensalidades ?? [],
    descontos: operacional?.descontos ?? [],
    valoresAvulsos: operacional?.valoresAvulsosReceber ?? [],
    financeiroMensal: [],
    auditLog: [],
    equipe: [],
    comunicados: operacional?.comunicados ?? [],
    votacoes: [],
    prestacaoContas: operacional?.prestacoesContas ?? [],
    contratos: [],
    instituicoes: [],
    propriedades: [],
    veiculos: [],
    fechamentosMensais: [],
    arquivosMensais: operacional?.arquivosMensais ?? [],
    livroCaixa: operacional?.livroCaixa ?? [],
    cotas: [],
    config: operacional?.config ?? { descontoPadraoCooperativa: 10 },
  } as AppData;

  resetResponsavelPainelIndexCache();
  const leitura = appDataParaConferirLeitura(data, coopId);
  const fila = listNotasFilaConferenciaResponsavel(leitura, coopId);
  const grupos = agruparPendentesPorCooperado(leitura, fila, coopId);

  let genericSnap = 0;
  let genericResolved = 0;
  const samples: string[] = [];

  for (const n of fila) {
    const snap = nomeCooperadoSnapshotUtilizavel(n.cooperadoNomeSnapshot);
    if (!snap) genericSnap += 1;
    const nome = getNomeEnvioEntregaNota(n, leitura, coopId);
    if (nome === "Cooperado") {
      genericResolved += 1;
      if (samples.length < 12) {
        samples.push(
          `nota=${n.id.slice(0, 8)} coopId=${n.cooperadoId?.slice(0, 8)} snap=${JSON.stringify(n.cooperadoNomeSnapshot)} nome=${nome}`
        );
      }
    }
  }

  const gruposGenericos = grupos.filter((g) => g.nome.trim() === "Cooperado");

  console.log(`=== Conferir nomes | ${CNPJ} | coop ${coopId} ===`);
  console.log(`cadastro cooperados: ${cooperados.length} | usuarios: ${users.length}`);
  console.log(`fila elegível: ${fila.length} | grupos UI: ${grupos.length}`);
  console.log(`sem snapshot utilizável na fila: ${genericSnap}`);
  console.log(`getNomeEnvio → "Cooperado": ${genericResolved}`);
  console.log(`grupos com nome "Cooperado": ${gruposGenericos.length}`);
  if (samples.length) {
    console.log("\nAmostras sem nome resolvido:");
    for (const s of samples) console.log(`  ${s}`);
  }
  if (gruposGenericos.length) {
    console.log("\nGrupos genéricos (primeiros 8):");
    for (const g of gruposGenericos.slice(0, 8)) {
      console.log(`  ${g.cooperadoId} notas=${g.notas.length} snap=${g.nome}`);
    }
  }

  const ok = genericResolved === 0 && gruposGenericos.length === 0;
  console.log(ok ? "\nRESULTADO: nomes OK na nuvem (simulação leitura Conferir)" : "\nRESULTADO: FALHA — nomes genéricos na fila");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
