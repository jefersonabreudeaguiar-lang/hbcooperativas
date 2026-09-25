import type { SupabaseClient } from "@supabase/supabase-js";
import type { PagamentoDowngradeBloqueado } from "@/services/pagamentoRegistroMerge";
import { aplicarPreservacaoPagamentosConfirmadosNoOperacionalComAudit } from "@/services/pagamentoIntegridadeService";
import { aplicarPreservacaoFichasReferenciadasPorPagamentosNoOperacional } from "@/services/fichaCorridaPagamentoGuard";
import type {
  Instituicao,
  ProdutoInstituicao,
  ArquivoMensalCooperado,
  AjustesFichaMesCooperativa,
  PagamentoCooperadoRegistro,
  Comunicado,
  ComunicadoExcluidoRef,
  Mensalidade,
  Desconto,
  ValorAvulsoReceber,
  LivroCaixaLancamento,
  LivroCaixaControleAnual,
  LivroCaixaExcluidoRef,
  PrestacaoContas,
  PrestacaoContasExcluida,
  NotaPedidoExcluida,
  InstituicaoExcluida,
  CronogramaContratoMensal,
  FichaCorrida,
  VotacaoPauta,
  VotacaoVoto,
  ParecerContabilMensal,
  FechamentoSnapshot,
} from "@/types";

const BUCKET = "hb-cooperativa-sync";

export interface ContratosSyncPayload {
  updatedAt: string;
  instituicoes: Instituicao[];
  produtosInstituicao: ProdutoInstituicao[];
  instituicoesExcluidas?: InstituicaoExcluida[];
  cronogramasContrato?: CronogramaContratoMensal[];
}

export interface OperacionalSyncPayload {
  updatedAt: string;
  /** Versão global de reset — dados anteriores são ignorados ao sincronizar. */
  operationalResetVersion?: number;
  /** Sinaliza limpeza de lançamentos operacionais (não apaga entregas/fotos). */
  fullReset?: boolean;
  /** Só true no reset admin manual — apaga entregas na nuvem. */
  wipeNotas?: boolean;
  arquivosMensais: ArquivoMensalCooperado[];
  ajustesFichaMes?: AjustesFichaMesCooperativa[];
  pagamentosCooperado: PagamentoCooperadoRegistro[];
  comunicados: Comunicado[];
  comunicadosExcluidos?: ComunicadoExcluidoRef[];
  mensalidades: Mensalidade[];
  descontos: Desconto[];
  valoresAvulsosReceber?: ValorAvulsoReceber[];
  livroCaixa?: LivroCaixaLancamento[];
  livroCaixaControleAnual?: LivroCaixaControleAnual[];
  livroCaixaExcluidos?: LivroCaixaExcluidoRef[];
  prestacoesContas?: PrestacaoContas[];
  prestacoesContasExcluidas?: PrestacaoContasExcluida[];
  notasPedidoExcluidas?: NotaPedidoExcluida[];
  /** Lançamentos da ficha (valor a receber) — sincroniza responsável ↔ cooperado. */
  fichaCorrida?: FichaCorrida[];
  votacaoPautas?: VotacaoPauta[];
  votacaoVotos?: VotacaoVoto[];
  pareceresContabeis?: ParecerContabilMensal[];
  fechamentoSnapshots?: FechamentoSnapshot[];
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

export type UploadOperacionalSyncOptions = {
  /** Evita segundo download quando o caller já leu operacional.json. */
  existingOperacional?: OperacionalSyncPayload | null;
  /** Uso interno / break-glass futuro — não usar no fluxo normal. */
  skipPagamentoConfirmadoProtection?: boolean;
};

export type UploadOperacionalSyncResult =
  | { ok: true; blockedDowngrades: PagamentoDowngradeBloqueado[] }
  | { ok: false; error: string };

export async function uploadOperacionalSync(
  supabase: SupabaseClient,
  cnpj: string,
  payload: OperacionalSyncPayload,
  options?: UploadOperacionalSyncOptions
): Promise<UploadOperacionalSyncResult> {
  let toUpload = payload;
  let blockedDowngrades: PagamentoDowngradeBloqueado[] = [];

  const existing =
    options?.existingOperacional !== undefined
      ? options.existingOperacional
      : await fetchOperacionalSync(supabase, cnpj);

  if (!options?.skipPagamentoConfirmadoProtection) {
    const preserved = await aplicarPreservacaoPagamentosConfirmadosNoOperacionalComAudit(
      supabase,
      cnpj,
      existing,
      payload
    );
    toUpload = preserved.payload;
    blockedDowngrades = preserved.blockedDowngrades;
  }

  if (existing) {
    const fichaPreserved = aplicarPreservacaoFichasReferenciadasPorPagamentosNoOperacional(
      existing,
      toUpload
    );
    toUpload = fichaPreserved.payload;
  }

  const uploaded = await uploadJson(supabase, cnpj, "operacional.json", toUpload);
  if (!uploaded.ok) return uploaded;
  return { ok: true, blockedDowngrades };
}

export async function fetchOperacionalSync(
  supabase: SupabaseClient,
  cnpj: string
): Promise<OperacionalSyncPayload | null> {
  return fetchJson<OperacionalSyncPayload>(supabase, cnpj, "operacional.json");
}
