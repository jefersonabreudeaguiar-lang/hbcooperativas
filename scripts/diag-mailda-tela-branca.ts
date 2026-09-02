/** Diagnóstico: cooperada Mailda — tela branca no app */
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
import { notaPertenceCooperado, resolverCooperadoIdCanonico } from "../src/services/cooperadoCloudService";
import { cooperadoFinanceiroLocalAusente } from "../src/services/fichaSyncGuard";
import {
  cooperadoExibirValorReceberInicio,
  getValorQuantoVouReceber,
  listarNotasPendentesCooperado,
} from "../src/services/cooperadoEntregasService";
import { getResumoPagamentoCooperado } from "../src/services/notaPedidoService";
import { listarResolvidosInicioCooperado } from "../src/services/cooperadoInicioResolvidosService";
import type { AppData } from "../src/types";

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

  const maildas = cloudCooperados.filter((c) => c.nomeCompleto.toLowerCase().includes("mailda"));
  console.log("=== Cooperados Mailda na nuvem ===");
  for (const c of maildas) {
    console.log(`  id=${c.id} nome=${c.nomeCompleto} cpf=${c.cpfCnpj} ativo=${c.ativo}`);
  }

  const { data: users } = await supabase
    .from("app_users")
    .select("id, email, name, role, active, cooperado_id, cooperativa_id, cooperativa_cnpj")
    .or(
      maildas.map((m) => `cooperado_id.eq.${m.id}`).join(",") +
        (maildas.length ? "," : "") +
        "name.ilike.%mailda%,email.ilike.%mailda%"
    );

  console.log("\n=== Usuários app Mailda ===");
  for (const u of users ?? []) {
    console.log(JSON.stringify(u, null, 2));
  }

  const notas = mergeNotasSources(tableResult.notas, storageNotas).map((n) => ({
    ...n,
    cooperativaId: n.cooperativaId ?? coop.id,
  }));

  const fichaCorrida = operacional?.fichaCorrida ?? [];
  const pagamentosCooperado = operacional?.pagamentosCooperado ?? [];

  const data: AppData = {
    cooperativas: [coop],
    users: [],
    cooperados: cloudCooperados.map((c) => ({ ...c, cooperativaId: coop.id })),
    mensalidades: operacional?.mensalidades ?? [],
    cotas: [],
    instituicoes: operacional?.instituicoes ?? [],
    produtosInstituicao: operacional?.produtosInstituicao ?? [],
    notasPedido: notas,
    fichaCorrida,
    pagamentosCooperado,
    arquivosMensais: operacional?.arquivosMensais ?? [],
    ajustesFichaMes: operacional?.ajustesFichaMes ?? [],
    entregas: [],
    descontos: operacional?.descontos ?? [],
    valoresAvulsosReceber: operacional?.valoresAvulsosReceber ?? [],
    pagamentos: [],
    financeiro: [],
    comunicados: operacional?.comunicados ?? [],
    reclamacoes: [],
    votacaoPautas: operacional?.votacaoPautas ?? [],
    votacaoVotos: operacional?.votacaoVotos ?? [],
    propriedades: [],
    veiculos: [],
    fechamentos: [],
    livroCaixa: [],
    prestacoesContas: operacional?.prestacoesContas ?? [],
    auditLog: [],
    config: operacional?.config ?? { descontoPadraoCooperativa: 5 },
  };

  for (const mailda of maildas) {
    console.log(`\n=== Simulação dashboard: ${mailda.nomeCompleto} ===`);
    const userCooperadoId = users?.find((u) => u.cooperado_id === mailda.id)?.cooperado_id ?? mailda.id;
    const canonico = resolverCooperadoIdCanonico(data, userCooperadoId, coop.id);
    console.log("  user.cooperadoId -> canonico:", userCooperadoId, "->", canonico);

    const financeiroAusente = cooperadoFinanceiroLocalAusente(data, canonico, coop.id);
    console.log("  cooperadoFinanceiroLocalAusente:", financeiroAusente);

    const notasDela = notas.filter((n) => notaPertenceCooperado(data, n, mailda.id, coop.id));
    console.log("  notas:", notasDela.length, notasDela.map((n) => `${n.status}/${n.mesReferencia}/val=${n.valorLiquido}`).join("; "));

    const fichas = fichaCorrida.filter((f) => f.cooperadoId === canonico || f.cooperadoId === mailda.id);
    console.log("  fichas:", fichas.length);

    try {
      const pendentes = listarNotasPendentesCooperado(data, canonico, coop.id);
      console.log("  notasPendentes:", pendentes.length);

      const valorReceber = cooperadoExibirValorReceberInicio(data, canonico, coop.id);
      console.log("  valorReceber:", valorReceber);

      const quanto = getValorQuantoVouReceber(data, canonico, coop.id);
      console.log("  getValorQuantoVouReceber:", quanto);

      const resolvidos = listarResolvidosInicioCooperado(data, canonico, coop.id);
      console.log("  resolvidos:", resolvidos.length);

      for (const mes of ["2026-08", "2026-09", "2026-07", "2026-12"]) {
        const t0 = Date.now();
        const resumo = getResumoPagamentoCooperado(data, canonico, mes, coop.id);
        console.log(
          `  resumo ${mes} (${Date.now() - t0}ms):`,
          resumo.valorLiquido,
          "descontos",
          resumo.descontosExtras.length,
          resumo.descontosExtras.map((d) => `${d.tipo}:${d.valor}`)
        );
      }
    } catch (e) {
      console.error("  ERRO:", e);
    }
  }

  // Notas com nome Mailda no snapshot
  const notasMaildaNome = notas.filter((n) => n.cooperadoNomeSnapshot?.toLowerCase().includes("mailda"));
  if (notasMaildaNome.length) {
    console.log("\n=== Notas com snapshot Mailda ===");
    for (const n of notasMaildaNome) {
      console.log(`  ${n.id} cooperadoId=${n.cooperadoId} status=${n.status} mes=${n.mesReferencia}`);
    }
  }
}

main().catch(console.error);
