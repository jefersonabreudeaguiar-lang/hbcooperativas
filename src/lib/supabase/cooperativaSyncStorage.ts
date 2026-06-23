import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Instituicao,
  ProdutoInstituicao,
  ArquivoMensalCooperado,
  AjustesFichaMesCooperativa,
  PagamentoCooperadoRegistro,
  Comunicado,
  Mensalidade,
  Desconto,
  ValorAvulsoReceber,
  LivroCaixaLancamento,
  PrestacaoContas,
} from "@/types";

const BUCKET = "hb-cooperativa-sync";

export interface ContratosSyncPayload {
  updatedAt: string;
  instituicoes: Instituicao[];
  produtosInstituicao: ProdutoInstituicao[];
}

export interface OperacionalSyncPayload {
  updatedAt: string;
  arquivosMensais: ArquivoMensalCooperado[];
  ajustesFichaMes?: AjustesFichaMesCooperativa[];
  pagamentosCooperado: PagamentoCooperadoRegistro[];
  comunicados: Comunicado[];
  mensalidades: Mensalidade[];
  descontos: Desconto[];
  valoresAvulsosReceber?: ValorAvulsoReceber[];
  livroCaixa?: LivroCaixaLancamento[];
  prestacoesContas?: PrestacaoContas[];
  config: { descontoPadraoCooperativa: number };
}

async function ensureBucket(supabase: SupabaseClient): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === BUCKET)) return;
  await supabase.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 5 * 1024 * 1024 });
}

function path(cnpj: string, file: string): string {
  return `${cnpj}/${file}`;
}

async function uploadJson(
  supabase: SupabaseClient,
  cnpj: string,
  file: string,
  payload: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureBucket(supabase);
  const { error } = await supabase.storage.from(BUCKET).upload(path(cnpj, file), JSON.stringify(payload), {
    contentType: "application/json",
    upsert: true,
  });
  if (error) {
    console.error(`[cooperativa-sync/upload/${file}]`, error.message);
    return { ok: false, error: "Erro ao sincronizar dados na nuvem." };
  }
  return { ok: true };
}

async function fetchJson<T>(supabase: SupabaseClient, cnpj: string, file: string): Promise<T | null> {
  await ensureBucket(supabase);
  const { data: blob, error } = await supabase.storage.from(BUCKET).download(path(cnpj, file));
  if (error || !blob) return null;
  try {
    return JSON.parse(await blob.text()) as T;
  } catch {
    return null;
  }
}

export async function uploadContratosSync(
  supabase: SupabaseClient,
  cnpj: string,
  payload: ContratosSyncPayload
): Promise<{ ok: true } | { ok: false; error: string }> {
  return uploadJson(supabase, cnpj, "contratos.json", payload);
}

export async function fetchContratosSync(
  supabase: SupabaseClient,
  cnpj: string
): Promise<ContratosSyncPayload | null> {
  return fetchJson<ContratosSyncPayload>(supabase, cnpj, "contratos.json");
}

export async function uploadOperacionalSync(
  supabase: SupabaseClient,
  cnpj: string,
  payload: OperacionalSyncPayload
): Promise<{ ok: true } | { ok: false; error: string }> {
  return uploadJson(supabase, cnpj, "operacional.json", payload);
}

export async function fetchOperacionalSync(
  supabase: SupabaseClient,
  cnpj: string
): Promise<OperacionalSyncPayload | null> {
  return fetchJson<OperacionalSyncPayload>(supabase, cnpj, "operacional.json");
}
