/**
 * Sync pós-decisão na conferência (aprovar/rejeitar): retentativas, estado visível, retry manual.
 * Não altera gravação local da nota/ficha — só PATCH (+ push operacional na aprovação).
 */
import type { NotaPedido } from "@/types";
import { getData } from "@/services/dataStore";
import {
  enqueueConferenciaAprovacaoSync,
  enqueueConferenciaRejeicaoSync,
  getConferenciaPatchSyncedSnapshot,
  markConferenciaPatchSyncedForOperacionalPush,
} from "@/services/conferenciaAprovacaoSyncQueue";
import {
  patchNotaDecisaoConferenciaNaNuvem,
  type ConferenciaPatchCloudUser,
} from "@/services/conferenciaPatchCloudTask";
import { withConferenciaOperacionalPushScope } from "@/services/conferenciaOperacionalPushScope";
import {
  pushOperacionalToCloud,
} from "@/services/cooperativaSyncCloudService";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { requestAppSyncLight } from "@/services/syncRequest";

export type ConferenciaNuvemSyncKind = "aprovacao" | "rejeicao";
export type ConferenciaNuvemSyncStatus = "syncing" | "synced" | "failed";

export type ConferenciaNuvemSyncRecord = {
  notaId: string;
  kind: ConferenciaNuvemSyncKind;
  status: ConferenciaNuvemSyncStatus;
  error?: string;
  updatedAt: number;
};

const RETRY_DELAYS_MS = [0, 1500, 4000, 10_000] as const;

type OperacionalPushOpts = {
  authoritative?: boolean;
  skipBulkCooperadosCloudPush?: boolean;
};

type PendingRetry = {
  notaId: string;
  kind: ConferenciaNuvemSyncKind;
  coopId: string;
  user: ConferenciaPatchCloudUser;
  nota: NotaPedido;
  operacionalPush?: OperacionalPushOpts;
  onSynced?: () => void;
  onFailed?: (error: string) => void;
};

const syncByNotaId = new Map<string, ConferenciaNuvemSyncRecord>();
const pendingRetry = new Map<string, PendingRetry>();
const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

function setSyncRecord(notaId: string, patch: Omit<ConferenciaNuvemSyncRecord, "notaId">): void {
  syncByNotaId.set(notaId, { notaId, ...patch });
  notifyListeners();
}

export function subscribeConferenciaNuvemSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getConferenciaNuvemSyncRecord(notaId: string): ConferenciaNuvemSyncRecord | undefined {
  return syncByNotaId.get(notaId);
}

export function listConferenciaNuvemSyncFailed(): ConferenciaNuvemSyncRecord[] {
  return [...syncByNotaId.values()].filter((r) => r.status === "failed");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executarPatchNota(
  coopId: string,
  user: ConferenciaPatchCloudUser,
  nota: NotaPedido
): Promise<void> {
  const patched = await patchNotaDecisaoConferenciaNaNuvem({ coopId, user, nota });
  if (!patched.ok) {
    throw new Error(patched.error);
  }
}

async function executarPushOperacionalAposPatch(
  notaId: string,
  coopId: string,
  user: ConferenciaPatchCloudUser,
  operacionalPush: OperacionalPushOpts | undefined
): Promise<void> {
  markConferenciaPatchSyncedForOperacionalPush(notaId);
  await withConferenciaOperacionalPushScope(coopId, getConferenciaPatchSyncedSnapshot(), async () => {
    const cnpj = await resolveCooperativaCnpj(getData(), coopId, user);
    if (!cnpj) {
      throw new Error("CNPJ da cooperativa não encontrado para sincronizar a ficha na nuvem.");
    }
    await pushOperacionalToCloud(cnpj, getData(), coopId, operacionalPush);
  });
}

async function runConferenciaNuvemSyncWithRetries(pending: PendingRetry): Promise<void> {
  const { kind, coopId, user, nota, operacionalPush, onSynced, onFailed } = pending;
  const notaId = nota.id;
  setSyncRecord(notaId, { kind, status: "syncing", updatedAt: Date.now() });

  let lastError = "Falha ao sincronizar com a nuvem.";
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay > 0) await sleep(delay);
    try {
      if (!coopId || !nota) {
        throw new Error("Dados insuficientes para sincronizar.");
      }
      await executarPatchNota(coopId, user, nota);
      if (kind === "aprovacao") {
        await executarPushOperacionalAposPatch(notaId, coopId, user, operacionalPush);
      }
      requestAppSyncLight();
      setSyncRecord(notaId, { kind, status: "synced", updatedAt: Date.now() });
      pendingRetry.delete(notaId);
      onSynced?.();
      return;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn("[conferencia-nuvem-sync]", notaId, kind, `tentativa ${attempt + 1}`, lastError);
    }
  }

  setSyncRecord(notaId, {
    kind,
    status: "failed",
    error: lastError,
    updatedAt: Date.now(),
  });
  onFailed?.(lastError);
  throw new Error(lastError);
}

function enqueueNuvemTask(pending: PendingRetry): void {
  const { notaId, kind } = pending;
  pendingRetry.set(notaId, pending);
  const enqueue = kind === "rejeicao" ? enqueueConferenciaRejeicaoSync : enqueueConferenciaAprovacaoSync;
  void enqueue(notaId, () => runConferenciaNuvemSyncWithRetries(pending));
}

export type ScheduleConferenciaNuvemSyncOpts = {
  notaId: string;
  coopId: string;
  user: ConferenciaPatchCloudUser;
  nota: NotaPedido;
  operacionalPush?: OperacionalPushOpts;
  onSynced?: () => void;
  onFailed?: (error: string) => void;
};

export function scheduleConferenciaAprovacaoNuvemSync(opts: ScheduleConferenciaNuvemSyncOpts): void {
  enqueueNuvemTask({ ...opts, kind: "aprovacao" });
}

export function scheduleConferenciaRejeicaoNuvemSync(opts: ScheduleConferenciaNuvemSyncOpts): void {
  enqueueNuvemTask({ ...opts, kind: "rejeicao" });
}

/** Retry manual ou ao voltar à aba — reutiliza o último snapshot da decisão. */
export function retryConferenciaNuvemSync(notaId: string): boolean {
  const pending = pendingRetry.get(notaId);
  if (!pending) return false;
  enqueueNuvemTask(pending);
  return true;
}

export function retryAllFailedConferenciaNuvemSync(): number {
  let count = 0;
  for (const id of pendingRetry.keys()) {
    const rec = syncByNotaId.get(id);
    if (rec?.status === "failed" && retryConferenciaNuvemSync(id)) count += 1;
  }
  return count;
}

/** Somente testes. */
export function resetConferenciaNuvemSyncForTests(): void {
  syncByNotaId.clear();
  pendingRetry.clear();
}
