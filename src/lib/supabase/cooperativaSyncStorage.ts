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
  /**
   * SYNC-001/S1 — snapshot operacional completo para replace autoritativo de coleções
   * (mensalidades, descontos, arquivos, …). Ausente/false: merge incremental mesmo com fullReset.
   */
  operacionalSnapshotComplete?: boolean;
  votacaoPautas?: VotacaoPauta[];
  votacaoVotos?: VotacaoVoto[];
  pareceresContabeis?: ParecerContabilMensal[];
  fechamentoSnapshots?: FechamentoSnapshot[];
  config: { descontoPadraoCooperativa: number };
}

/** Limite do operacional.json — alinhado a notas (50 MB); buckets antigos são elevados via updateBucket. */
export const COOPERATIVA_SYNC_FILE_SIZE_LIMIT = 50 * 1024 * 1024;

async function ensureBucket(supabase: SupabaseClient): Promise<void> {
  const limit = COOPERATIVA_SYNC_FILE_SIZE_LIMIT;
  const { data: buckets } = await supabase.storage.listBuckets();
  const existing = buckets?.find((b) => b.name === BUCKET);
  if (!existing) {
    await supabase.storage.createBucket(BUCKET, { public: false, fileSizeLimit: limit });
    return;
  }
  const currentLimit = existing.file_size_limit ?? 0;
  if (currentLimit < limit) {
    await supabase.storage.updateBucket(BUCKET, { public: false, fileSizeLimit: limit });
  }
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
  const body = JSON.stringify(payload);
  const bytes = Buffer.byteLength(body, "utf8");
  if (bytes > COOPERATIVA_SYNC_FILE_SIZE_LIMIT) {
    return {
      ok: false,
      error: `operacional.json excede ${Math.round(COOPERATIVA_SYNC_FILE_SIZE_LIMIT / (1024 * 1024))} MB (${(bytes / (1024 * 1024)).toFixed(1)} MB).`,
    };
  }
  const { error } = await supabase.storage.from(BUCKET).upload(path(cnpj, file), body, {
    contentType: "application/json",
    upsert: true,
  });
  if (error) {
    console.error(`[cooperativa-sync/upload/${file}]`, error.message);
    return { ok: false, error: error.message || "Erro ao sincronizar dados na nuvem." };
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
