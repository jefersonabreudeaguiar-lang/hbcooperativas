import { normalizeCnpj } from "@/utils/cooperativa";

/**
 * H8.9.60 Fase 1A — single-flight por CNPJ para push operacional.
 * Integração em `pushOperacionalToCloud` virá em etapa posterior; **default OFF**.
 */
export const OPERACIONAL_PUSH_SINGLE_FLIGHT_ENABLED = false as const;

/** Somente testes — não altera a constante de produção. */
let enabledOverrideForTests: boolean | null = null;

export function setOperacionalPushSingleFlightEnabledForTests(enabled: boolean | null): void {
  enabledOverrideForTests = enabled;
}

export function isOperacionalPushSingleFlightEnabled(): boolean {
  if (enabledOverrideForTests !== null) return enabledOverrideForTests;
  return OPERACIONAL_PUSH_SINGLE_FLIGHT_ENABLED;
}

export type OperacionalPushOperation<T> = () => Promise<T>;

function queueKey(cnpj: string): string {
  return normalizeCnpj(cnpj);
}

/** Fila FIFO por CNPJ (14 dígitos); CNPJs distintos não compartilham fila. */
const tails = new Map<string, Promise<void>>();

/**
 * Enfileira `operation` após todas as operações anteriores do mesmo CNPJ.
 * Retorna a Promise dessa operação (sucesso ou erro propagado ao chamador).
 */
export function enqueueOperacionalPush<T>(cnpj: string, operation: OperacionalPushOperation<T>): Promise<T> {
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

/** Somente testes — zera filas in-memory. */
export function resetOperacionalPushSingleFlightForTests(): void {
  tails.clear();
}

/** Somente testes — quantas filas ativas por CNPJ. */
export function operacionalPushSingleFlightPendingCount(): number {
  return tails.size;
}
