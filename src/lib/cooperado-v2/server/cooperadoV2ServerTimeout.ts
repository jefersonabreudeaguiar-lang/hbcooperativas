export class CooperadoV2ServerTimeoutError extends Error {
  constructor() {
    super("COOPERADO_V2_SERVER_TIMEOUT");
    this.name = "CooperadoV2ServerTimeoutError";
  }
}

export function isCooperadoV2ServerTimeoutError(e: unknown): boolean {
  return e instanceof CooperadoV2ServerTimeoutError;
}

/** Evita requisição presa na Vercel sem resposta ao celular. */
export async function withCooperadoV2ServerTimeout<T>(ms: number, fn: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new CooperadoV2ServerTimeoutError()), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
