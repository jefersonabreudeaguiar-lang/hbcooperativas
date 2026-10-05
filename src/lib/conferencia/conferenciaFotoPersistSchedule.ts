/** Persistência da ficha por foto — fora do clique (idle) para não travar o modal. */

const queue: Array<() => void> = [];
let idleHandle: number | null = null;

function runNext(): void {
  idleHandle = null;
  const job = queue.shift();
  if (!job) return;
  try {
    job();
  } finally {
    if (queue.length) schedulePump();
  }
}

function schedulePump(): void {
  if (idleHandle != null || !queue.length) return;
  if (typeof requestIdleCallback !== "undefined") {
    idleHandle = requestIdleCallback(() => runNext(), { timeout: 120 });
  } else {
    idleHandle = window.setTimeout(() => runNext(), 0) as unknown as number;
  }
}

/** Enfileira gravação pesada (updateData) após pintar a próxima foto. */
export function scheduleConferenciaFotoPersist(job: () => void): void {
  queue.push(job);
  schedulePump();
}

/** Antes da aprovação final — garante fotos pendentes na memória/ficha. */
export function flushConferenciaFotoPersistNow(): void {
  if (idleHandle != null && typeof cancelIdleCallback !== "undefined") {
    cancelIdleCallback(idleHandle);
  } else if (idleHandle != null) {
    clearTimeout(idleHandle);
  }
  idleHandle = null;
  while (queue.length) {
    const job = queue.shift();
    job?.();
  }
}

export function conferenciaFotoPersistQueueEmpty(): boolean {
  return queue.length === 0 && idleHandle == null;
}
