type Listener = () => void;

type FailureEntry = { at: string; message?: string };

let revision = 0;
const failures = new Map<string, FailureEntry>();
/** Sessão: último fetch HB→A receber por mês concluiu com sucesso (fonte = hb_credit_transactions). */
const mesFetchAutoritativo = new Set<string>();
const listeners = new Set<Listener>();

function key(cooperativaId: string, cooperadoId: string): string {
  return `${cooperativaId}:${cooperadoId}`;
}

function mesKey(cooperativaId: string, cooperadoId: string, mesReferencia: string): string {
  return `${cooperativaId}:${cooperadoId}:${mesReferencia}`;
}

function notify(): void {
  revision += 1;
  listeners.forEach((l) => l());
}

export function getContaCoopDescontosSyncHealthRevision(): number {
  return revision;
}

export function subscribeContaCoopDescontosSyncHealth(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function markContaCoopDescontosFetchOk(cooperativaId: string, cooperadoId: string): void {
  const k = key(cooperativaId, cooperadoId);
  if (!failures.has(k)) return;
  failures.delete(k);
  notify();
}

/** HB-002 — após poll/API bem-sucedido, projeção SQL do mês vence arquivo operacional stale. */
export function markContaCoopDescontosMesFetchOk(
  cooperativaId: string,
  cooperadoId: string,
  mesReferencia: string
): void {
  mesFetchAutoritativo.add(mesKey(cooperativaId, cooperadoId, mesReferencia));
  markContaCoopDescontosFetchOk(cooperativaId, cooperadoId);
}

export function clearContaCoopDescontosMesFetchAutoritativo(
  cooperativaId: string,
  cooperadoId: string,
  mesReferencia: string
): void {
  if (!mesFetchAutoritativo.delete(mesKey(cooperativaId, cooperadoId, mesReferencia))) return;
  notify();
}

export function contaCoopDescontosMesFetchAutoritativo(
  cooperativaId: string,
  cooperadoId: string,
  mesReferencia: string
): boolean {
  return mesFetchAutoritativo.has(mesKey(cooperativaId, cooperadoId, mesReferencia));
}

export function markContaCoopDescontosFetchFailed(
  cooperativaId: string,
  cooperadoId: string,
  message?: string,
  mesReferencia?: string
): void {
  if (mesReferencia) {
    clearContaCoopDescontosMesFetchAutoritativo(cooperativaId, cooperadoId, mesReferencia);
  }
  failures.set(key(cooperativaId, cooperadoId), {
    at: new Date().toISOString(),
    message: message?.slice(0, 200),
  });
  notify();
}

export function cooperadoContaCoopDescontosSyncFalhou(
  cooperativaId: string,
  cooperadoId: string
): boolean {
  return failures.has(key(cooperativaId, cooperadoId));
}

export function getContaCoopDescontosSyncFailureMessage(
  cooperativaId: string,
  cooperadoId: string
): string | undefined {
  return failures.get(key(cooperativaId, cooperadoId))?.message;
}
