import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { emptyInitialData } from "@/mock/data";
import { fetchCooperadosFromStorage } from "@/lib/supabase/cooperadosStorage";
import { fetchOperacionalSync } from "@/lib/supabase/cooperativaSyncStorage";
import { fetchNotasFromTable, fetchNotaFromStorage, mergeNotasSources } from "@/lib/supabase/notasStorage";
import type { NotaPedido } from "@/types";
import { listCooperadoContaCoopDescontosAbateValorReceber } from "@/lib/supabase/contaCoopStorage";
import { cooperativaFromCloudRow } from "@/utils/cooperativaCadastro";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { persistDescontosContaCoopNoArquivo } from "@/services/notaPedidoService";
import { leituraFinanceiraParidadeCooperado } from "@/lib/cooperado/cooperadoFinanceiroParidadeUniversal";
import { cooperadoFinanceiroScopedData } from "@/lib/cooperado/cooperadoFinanceiroScopedData";
import type { CooperadoFinanceiroRemoto } from "@/lib/cooperado/cooperadoFinanceiroRemotoTypes";
import type { AppData } from "@/types";

const inflight = new Map<string, Promise<CooperadoFinanceiroRemoto>>();

async function read(cnpj: string, cooperadoId: string): Promise<CooperadoFinanceiroRemoto> {
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error("Nuvem indisponível");
  const [{ data: rows, error }, cooperados, op, table] = await Promise.all([
    sb.from("cooperativas").select("*").eq("cnpj", cnpj).limit(1),
    fetchCooperadosFromStorage(sb, cnpj),
    fetchOperacionalSync(sb, cnpj),
    fetchNotasFromTable(sb, cnpj),
  ]);
  if (error || !rows?.length || !op) throw new Error("Dados financeiros indisponíveis");
  const coop = cooperativaFromCloudRow(rows[0] as Record<string, unknown>);
  let data: AppData = {
    ...emptyInitialData,
    cooperativas: [coop], cooperados: cooperados.map((c) => ({ ...c, cooperativaId: coop.id })),
    notasPedido: table.notas.map((n) => ({ ...n, cooperativaId: n.cooperativaId ?? coop.id })),
    fichaCorrida: op.fichaCorrida ?? [], pagamentosCooperado: op.pagamentosCooperado ?? [],
    arquivosMensais: op.arquivosMensais ?? [], ajustesFichaMes: op.ajustesFichaMes ?? [],
    valoresAvulsosReceber: op.valoresAvulsosReceber ?? [], descontos: op.descontos ?? [],
    mensalidades: op.mensalidades ?? [], config: { ...emptyInitialData.config, ...op.config },
    notasPedidoExcluidas: op.notasPedidoExcluidas ?? [],
  };
  const canon = resolverCooperadoIdCanonico(data, cooperadoId, coop.id);
  const aliases = data.cooperados.filter((c) => resolverCooperadoIdCanonico(data, c.id, coop.id) === canon).map((c) => c.id);
  data = cooperadoFinanceiroScopedData(data, canon, coop.id);
  // Busca somente as notas deste cooperado; não baixa centenas de arquivos/fotos da cooperativa.
  const ids = [...new Set([...data.fichaCorrida.map((f) => f.notaPedidoId), ...data.notasPedido.map((n) => n.id)])];
  const storage: NotaPedido[] = [];
  for (let at = 0; at < ids.length; at += 8) {
    const batch = await Promise.all(ids.slice(at, at + 8).map((id) => fetchNotaFromStorage(sb, cnpj, id)));
    for (const nota of batch) if (nota) storage.push(nota);
  }
  data = { ...data, notasPedido: mergeNotasSources(data.notasPedido, storage).map((n) => ({ ...n, cooperativaId: n.cooperativaId ?? coop.id })) };
  if (data.fichaCorrida.some((f) => f.status === "pendente" && !data.notasPedido.some((n) => n.id === f.notaPedidoId))) {
    throw new Error("Notas da ficha ainda indisponíveis");
  }
  const meses = [...new Set([
    ...data.fichaCorrida.map((f) => f.mesReferencia),
    ...(data.valoresAvulsosReceber ?? []).filter((v) => v.status === "pendente").map((v) => v.mesReferencia),
  ])].filter(Boolean).sort();
  if (meses.length) {
    const linhas = await listCooperadoContaCoopDescontosAbateValorReceber(sb, cnpj, [...new Set([cooperadoId, canon, ...aliases])], meses[0]);
    // Somente projeção em memória: não grava arquivos nem transações na nuvem.
    for (const mes of meses) data = persistDescontosContaCoopNoArquivo(data, canon, mes, coop.id, linhas);
  }
  return { cooperadoId: canon, cooperativaId: coop.id, fetchedAt: new Date().toISOString(), paridade: leituraFinanceiraParidadeCooperado(data, canon, coop.id) };
}

export function fetchCooperadoFinanceiroRemoto(cnpj: string, cooperadoId: string): Promise<CooperadoFinanceiroRemoto> {
  const key = `${cnpj}:${cooperadoId}`;
  const pending = inflight.get(key);
  if (pending) return pending;
  const promise = read(cnpj, cooperadoId).finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}
