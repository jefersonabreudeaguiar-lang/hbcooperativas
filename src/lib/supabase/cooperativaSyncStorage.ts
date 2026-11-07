import { preservarCotasIngresso } from "@/services/cotaIngressoMerge";
import { projectOperationalFinancialRecords } from "./hbCreditOperacionalFinancialProjection";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PagamentoDowngradeBloqueado } from "@/services/pagamentoRegistroMerge";
import { aplicarPreservacaoPagamentosConfirmadosNoOperacionalComAudit } from "@/services/pagamentoIntegridadeService";
import { aplicarPreservacaoFichasReferenciadasPorPagamentosNoOperacional } from "@/services/fichaCorridaPagamentoGuard";
import { aplicarPreservacaoLivroCaixaPagamentosConfirmadosNoOperacional } from "@/services/livroCaixaPagamentoGuard";
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
  LivroCaixaOrigemCadastro,
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
export class CooperativaSyncStorageUnavailable extends Error {}

// The revision belongs to the server-read object, never to incoming JSON.
const operacionalRevisions = new WeakMap<OperacionalSyncPayload, { cnpj: string; revision: string | null }>();

export function isVersionedOperacionalSyncEnabled(cnpj: string): boolean {
  return /^\d{14}$/.test(cnpj) &&
    process.env.HB_HOMOLOGATION_ONLY === "true" &&
    process.env.HB_OPERACIONAL_VERSIONED_SYNC === "true" &&
    process.env.HB_OPERACIONAL_VERSIONED_SYNC_CNPJ === cnpj;
}

export function getOperacionalReadRevision(cnpj: string, payload: OperacionalSyncPayload | null): string | null | undefined {
  if (payload === null) return null;
  const read = operacionalRevisions.get(payload);
  return read?.cnpj === cnpj ? read.revision : undefined;
}

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
  livroCaixaOrigensCadastro?: LivroCaixaOrigemCadastro[];
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
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError || !buckets) throw new CooperativaSyncStorageUnavailable("Não foi possível conferir o armazenamento da nuvem. Tente novamente.");
  const existing = buckets?.find((b) => b.name === BUCKET);
  if (!existing) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: false, fileSizeLimit: limit });
    if (error) throw new CooperativaSyncStorageUnavailable("Não foi possível preparar o armazenamento da nuvem. Tente novamente.");
    return;
  }
  const currentLimit = existing.file_size_limit ?? 0;
  if (currentLimit < limit) {
    const { error } = await supabase.storage.updateBucket(BUCKET, { public: false, fileSizeLimit: limit });
    if (error) throw new CooperativaSyncStorageUnavailable("Não foi possível conferir a capacidade do armazenamento da nuvem. Tente novamente.");
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
    cacheControl: "0",
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
  const { data: blob, error } = await supabase.storage.from(BUCKET).download(
    path(cnpj, file),
    { cacheNonce: crypto.randomUUID() },
    { cache: "no-store" }
  );
  // Ausência é diferente de indisponibilidade: nunca iniciar um snapshot vazio
  // quando a leitura falhou por rede, permissão ou resposta inválida.
  if (error) {
    if (String(error.statusCode) === "404") return null;
    throw new CooperativaSyncStorageUnavailable("Não foi possível ler os dados da nuvem. Tente novamente.");
  }
  if (!blob) throw new CooperativaSyncStorageUnavailable("A nuvem retornou uma leitura incompleta. Tente novamente.");
  try {
    const parsed: unknown = JSON.parse(await blob.text());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid snapshot");
    return parsed as T;
  } catch {
    throw new CooperativaSyncStorageUnavailable("Não foi possível validar os dados salvos na nuvem. Tente novamente.");
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
  /** Baseline used by specialized writers to construct the mutation. */
  versionedBase?: OperacionalSyncPayload | null;
  /** Uso interno / break-glass futuro — não usar no fluxo normal. */
  skipPagamentoConfirmadoProtection?: boolean;
  /** Somente reset administrativo explícito da cota. */
  skipCotaProtection?: boolean;
};

export type UploadOperacionalSyncResult =
  | { ok: true; blockedDowngrades: PagamentoDowngradeBloqueado[]; revision?: string }
  | { ok: false; error: string; code?: "OPERACIONAL_CONFLICT" | "OPERACIONAL_BASE_REQUIRED" | "OPERACIONAL_RESET_BLOCKED" };

export async function uploadOperacionalSync(
  supabase: SupabaseClient,
  cnpj: string,
  payload: OperacionalSyncPayload,
  options?: UploadOperacionalSyncOptions
): Promise<UploadOperacionalSyncResult> {
  const versioned = isVersionedOperacionalSyncEnabled(cnpj);
  if (versioned && (payload.fullReset || payload.wipeNotas)) {
    return { ok: false, code: "OPERACIONAL_RESET_BLOCKED", error: "A limpeza operacional está indisponível nesta versão de teste." };
  }
  const base = options?.versionedBase !== undefined ? options.versionedBase : options?.existingOperacional;
  const expected = base === undefined
    ? undefined
    : getOperacionalReadRevision(cnpj, base);
  if (versioned && expected === undefined) {
    return { ok: false, code: "OPERACIONAL_BASE_REQUIRED", error: "Atualize os dados da nuvem antes de salvar." };
  }
  let toUpload = payload;
  let blockedDowngrades: PagamentoDowngradeBloqueado[] = [];

  const existing =
    versioned && base !== undefined
      ? base
      : options?.existingOperacional !== undefined
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
    toUpload = aplicarPreservacaoLivroCaixaPagamentosConfirmadosNoOperacional(
      existing,
      toUpload
    ).payload;
  }

  if (existing && !options?.skipCotaProtection) {
    toUpload = { ...toUpload, arquivosMensais: preservarCotasIngresso(existing.arquivosMensais ?? [], toUpload.arquivosMensais ?? []) };
  }
  // A cópia do aparelho não pode apagar cashback ou repasse confirmado no banco.
  toUpload = (await projectOperationalFinancialRecords(supabase, cnpj, toUpload, existing))!;
  if (versioned) {
    const { data, error } = await supabase.rpc("hb_operacional_compare_and_save", {
      p_cnpj: cnpj,
      p_expected_revision: expected,
      p_payload: toUpload,
    });
    if (error) return { ok: false, error: "Não foi possível confirmar a gravação na nuvem. Confira o resultado antes de tentar novamente." };
    if (data === null) {
      return { ok: false, code: "OPERACIONAL_CONFLICT", error: "Os dados da nuvem mudaram durante a gravação. Atualize antes de tentar novamente." };
    }
    if (typeof data !== "string") return { ok: false, error: "A nuvem não confirmou a versão gravada." };
    return { ok: true, blockedDowngrades, revision: data };
  }
  const uploaded = await uploadJson(supabase, cnpj, "operacional.json", toUpload);
  if (!uploaded.ok) return uploaded;
  return { ok: true, blockedDowngrades };
}

export async function fetchOperacionalSync(
  supabase: SupabaseClient,
  cnpj: string
): Promise<OperacionalSyncPayload | null> {
  const versioned = isVersionedOperacionalSyncEnabled(cnpj);
  const row = versioned
    ? await supabase.from("hb_operacional_snapshots").select("revision,payload").eq("cooperativa_cnpj", cnpj).maybeSingle()
    : null;
  if (row?.error) throw new CooperativaSyncStorageUnavailable("Não foi possível consultar a versão dos dados na nuvem.");
  const payload = row?.data
    ? row.data.payload as OperacionalSyncPayload
    : await fetchJson<OperacionalSyncPayload>(supabase, cnpj, "operacional.json");
  const projected = await projectOperationalFinancialRecords(supabase, cnpj, payload);
  if (versioned && projected) operacionalRevisions.set(projected, { cnpj, revision: row?.data?.revision ?? null });
  return projected;
}

/** Tombstone + ficha na nuvem quando a entrega foi apagada via API (não depende só do push do staff). */
export async function applyNotaPedidoDeletedOnOperacionalSync(
  supabase: SupabaseClient,
  cnpj: string,
  notaId: string,
  cooperativaId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const existing = await fetchOperacionalSync(supabase, cnpj);
  if (!existing) return { ok: true };

  const now = new Date().toISOString();
  const prev = existing.notasPedidoExcluidas ?? [];
  const entry: NotaPedidoExcluida = { id: notaId, cooperativaId, deletedAt: now };
  const has = prev.some((e) => e.id === notaId && e.cooperativaId === cooperativaId);
  const notasPedidoExcluidas = has
    ? prev.map((e) => (e.id === notaId && e.cooperativaId === cooperativaId ? entry : e))
    : [...prev, entry];

  const fichaCorrida = (existing.fichaCorrida ?? []).filter((f) => f.notaPedidoId !== notaId);
  const arquivosMensais = (existing.arquivosMensais ?? []).map((a) => {
    const notaPedidoIds = a.notaPedidoIds.filter((id) => id !== notaId);
    if (notaPedidoIds.length === a.notaPedidoIds.length) return a;
    return { ...a, notaPedidoIds, updatedAt: now };
  });

  const payload: OperacionalSyncPayload = {
    ...existing,
    updatedAt: now,
    notasPedidoExcluidas,
    fichaCorrida,
    arquivosMensais,
  };

  const uploaded = await uploadOperacionalSync(supabase, cnpj, payload, { existingOperacional: existing });
  if (!uploaded.ok) return uploaded;
  return { ok: true };
}

const LANCAMENTO_HINTS_FILE = "lancamento-hints.json";
const LANCAMENTO_HINT_MAX_ENTRIES = 200;
const LANCAMENTO_HINT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type CooperadoLancamentoHintEntry = {
  at: string;
  notaId: string;
};

export type CooperadoLancamentoHintsPayload = {
  updatedAt: string;
  byCooperado: Record<string, CooperadoLancamentoHintEntry>;
};

function pruneLancamentoHints(
  payload: CooperadoLancamentoHintsPayload,
  nowMs: number
): CooperadoLancamentoHintsPayload {
  const entries = Object.entries(payload.byCooperado ?? {}).filter(([id, entry]) => {
    if (!id || !entry?.at || !entry?.notaId) return false;
    const at = Date.parse(entry.at);
    if (!Number.isFinite(at)) return false;
    return nowMs - at <= LANCAMENTO_HINT_TTL_MS;
  });
  entries.sort((a, b) => Date.parse(b[1].at) - Date.parse(a[1].at));
  const trimmed = entries.slice(0, LANCAMENTO_HINT_MAX_ENTRIES);
  return {
    updatedAt: payload.updatedAt,
    byCooperado: Object.fromEntries(trimmed),
  };
}

export async function fetchLancamentoHintsSync(
  supabase: SupabaseClient,
  cnpj: string
): Promise<CooperadoLancamentoHintsPayload | null> {
  return fetchJson<CooperadoLancamentoHintsPayload>(supabase, cnpj, LANCAMENTO_HINTS_FILE);
}

export async function mergeLancamentoHintsSync(
  supabase: SupabaseClient,
  cnpj: string,
  hints: { cooperadoId: string; notaId: string }[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const nowMs = Date.parse(now);
  const existing = (await fetchLancamentoHintsSync(supabase, cnpj)) ?? {
    updatedAt: now,
    byCooperado: {},
  };
  const next: CooperadoLancamentoHintsPayload = {
    updatedAt: now,
    byCooperado: { ...existing.byCooperado },
  };
  for (const hint of hints) {
    const id = hint.cooperadoId.trim();
    const notaId = hint.notaId.trim();
    if (!id || !notaId) continue;
    next.byCooperado[id] = { at: now, notaId };
  }
  return uploadJson(supabase, cnpj, LANCAMENTO_HINTS_FILE, pruneLancamentoHints(next, nowMs));
}
