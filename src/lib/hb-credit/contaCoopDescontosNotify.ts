type Listener = () => void;

let revision = 0;
const listeners = new Set<Listener>();

/** Incrementado quando descontos HB (memória) mudam — força recálculo do valor a receber na UI. */
export function getContaCoopDescontosRevision(): number {
  return revision;
}

export function subscribeContaCoopDescontos(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function bumpContaCoopDescontosRevision(): void {
  revision += 1;
  listeners.forEach((l) => l());
}
