type Listener = () => void;

type FailureEntry = { at: string; message?: string };

let revision = 0;
const failures = new Map<string, FailureEntry>();
const listeners = new Set<Listener>();

function key(cooperativaId: string, cooperadoId: string): string {
  return `${cooperativaId}:${cooperadoId}`;
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

export function markContaCoopDescontosFetchFailed(
  cooperativaId: string,
  cooperadoId: string,
  message?: string
): void {
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
