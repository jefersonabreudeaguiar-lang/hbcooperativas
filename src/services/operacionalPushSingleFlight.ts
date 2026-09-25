import { normalizeCnpj } from "@/utils/cooperativa";

/**
 * H8.9.60 Fase 1A — single-flight por CNPJ para push operacional.
 * Integração em `pushOperacionalToCloud`; default OFF (env ausente / inválida).
 */
const CLIENT_FLAG = "NEXT_PUBLIC_OPERACIONAL_PUSH_SINGLE_FLIGHT_ENABLED";
const ALLOWED_ON = new Set(["true", "1"]);

function parsePublicOperacionalPushFlag(raw: string | undefined): boolean {
  if (raw == null || raw.trim() === "") return false;
  return ALLOWED_ON.has(raw.trim().toLowerCase());
}

/** Valor legado/documental. O runtime efetivo é determinado por `isOperacionalPushSingleFlightEnabled()`. */
export const OPERACIONAL_PUSH_SINGLE_FLIGHT_ENABLED = false as const;

/** Somente testes — não altera a leitura de env de produção. */
let enabledOverrideForTests: boolean | null = null;

export function setOperacionalPushSingleFlightEnabledForTests(enabled: boolean | null): void {
  enabledOverrideForTests = enabled;
}

export function isOperacionalPushSingleFlightEnabled(): boolean {
  if (enabledOverrideForTests !== null) return enabledOverrideForTests;
  return parsePublicOperacionalPushFlag(process.env[CLIENT_FLAG]);
}

export type OperacionalPushOperation<T> = () => Promise<T>;

function queueKey(cnpj: string): string {
  return normalizeCnpj(cnpj);
}

/** Fila FIFO por CNPJ (14 dígitos); CNPJs distintos não compartilham fila. */
const tails = new Map<string, Promise<void>>();

/**
 * H8.9.88 — coordenação exclusiva por CNPJ (push, bidirectional, etc.).
 * Enfileira `operation` após todas as operações anteriores do mesmo CNPJ.
 * Retorna a Promise dessa operação (sucesso ou erro propagado ao chamador).
 */
export function enqueueOperacionalCoordination<T>(
  cnpj: string,
  operation: OperacionalPushOperation<T>
): Promise<T> {
  const key = queueKey(cnpj);
  const previous = tails.get(key) ?? Promise.resolve();

  const run = previous.then(() => operation());

  const tail = run.then(
    () => undefined,
    () => undefined
  );

  tails.set(key, tail);

  void tail.finally(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });

  return run;
}

/** Compat H8.9.60 — push operacional na mesma fila de coordenação. */
export function enqueueOperacionalPush<T>(cnpj: string, operation: OperacionalPushOperation<T>): Promise<T> {
  return enqueueOperacionalCoordination(cnpj, operation);
}

/** Somente testes — zera filas in-memory. */
export function resetOperacionalPushSingleFlightForTests(): void {
  tails.clear();
}

/** Somente testes — quantas filas ativas por CNPJ. */
export function operacionalPushSingleFlightPendingCount(): number {
  return tails.size;
}
