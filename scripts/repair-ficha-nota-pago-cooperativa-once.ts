/**
 * Reconcilia ficha + alinha status quando nota já está pago (remove fantasma no a receber).
 * npx tsx scripts/repair-ficha-nota-pago-cooperativa-once.ts
 * npx tsx scripts/repair-ficha-nota-pago-cooperativa-once.ts --apply
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData } from "../src/types";
import { normalizeCnpj } from "../src/utils/cooperativa";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import { fetchNotasFromStorage, fetchNotasFromTable, mergeNotasSources } from "../src/lib/supabase/notasStorage";
import { fetchContratosSync, fetchOperacionalSync, uploadOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";
import { mergeCloudCooperadosIntoData } from "../src/services/cooperadoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import { reconciliarFichaFromNotasConferidas, fichaNotaElegivelParaPagamento } from "../src/services/notaPedidoService";
import { getValorQuantoVouReceber } from "../src/services/cooperadoEntregasService";
import { fichaPertenceCooperado } from "../src/services/cooperadoCloudService";

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
process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL = "true";

const CNPJ = normalizeCnpj(process.argv.find((a) => a.startsWith("--cnpj="))?.split("=")[1] ?? "62351750000165");
const APPLY = process.argv.includes("--apply");

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

function ghostPendentePago(data: AppData, coopId: string): number {
  let sum = 0;
  for (const f of data.fichaCorrida) {
    if (f.status !== "pendente") continue;
    const n = data.notasPedido.find((x) => x.id === f.notaPedidoId);
    if (n?.status !== "pago") continue;
    if (!fichaNotaElegivelParaPagamento(data, f)) continue;
    sum += f.valorLiquido;
  }
  return Math.round(sum * 100) / 100;
}

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
    realtime: { transport: ws },
  });
  const { data: rows } = await sb.from("cooperativas").select("*").eq("cnpj", CNPJ);
  if (!rows?.length) throw new Error("Cooperativa não encontrada");
  const coop = cooperativaFromCloudRow(rows[0] as Record<string, unknown>);
  const [cloudCooperados, storageNotas, tableResult, contratos, operacional] = await Promise.all([
    fetchCooperadosFromStorage(sb, CNPJ),
    fetchNotasFromStorage(sb, CNPJ),
    fetchNotasFromTable(sb, CNPJ),
    fetchContratosSync(sb, CNPJ),
    fetchOperacionalSync(sb, CNPJ),
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

  const ghostAntes = ghostPendentePago(data, coop.id);
  const reconciled = reconciliarFichaFromNotasConferidas(data);
  const ghostDepois = ghostPendentePago(reconciled, coop.id);

  let fixed = 0;
  for (const f of data.fichaCorrida) {
    const n = reconciled.fichaCorrida.find((x) => x.id === f.id);
    if (n && n.status !== f.status) fixed += 1;
  }

  console.log(`CNPJ ${CNPJ} | APPLY=${APPLY}`);
  console.log(`Fantasma a receber (pendente + nota pago): R$ ${ghostAntes.toFixed(2)} → R$ ${ghostDepois.toFixed(2)}`);
  console.log(`Fichas com status alterado: ${fixed}`);

  const trio = reconciled.cooperados.filter((c) => /ivan arruda|cleber|cleito/i.test(c.nomeCompleto));
  for (const c of trio) {
    const v = getValorQuantoVouReceber(reconciled, c.id, coop.id);
    console.log(`  ${c.nomeCompleto.split(" ")[0]}: R$ ${v.valor.toFixed(2)} (${v.meses.join(", ") || "—"})`);
  }

  if (!APPLY) {
    console.log("\nDry-run — use --apply para gravar operacional.json");
    return;
  }

  mkdirSync(resolve(process.cwd(), "scripts/backups"), { recursive: true });
  const backup = resolve(process.cwd(), `scripts/backups/pre-repair-ficha-nota-pago-${Date.now()}.json`);
  writeFileSync(backup, JSON.stringify({ fichaCorrida: operacional.fichaCorrida }, null, 2));

  const payload = {
    ...operacional,
    updatedAt: new Date().toISOString(),
    fichaCorrida: reconciled.fichaCorrida.filter((f) => f.cooperativaId === coop.id),
    arquivosMensais: reconciled.arquivosMensais.filter((a) => a.cooperativaId === coop.id),
  };
  const up = await uploadOperacionalSync(sb, CNPJ, payload);
  if (!up.ok) throw new Error(up.error ?? "upload operacional falhou");
  console.log(`\n✓ operacional atualizado (backup ${backup})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
