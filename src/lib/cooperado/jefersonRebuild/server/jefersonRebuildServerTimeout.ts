export class JefersonRebuildServerTimeoutError extends Error {
  constructor() {
    super("Jeferson rebuild server timeout");
    this.name = "JefersonRebuildServerTimeoutError";
  }
}

export function isJefersonRebuildServerTimeoutError(e: unknown): boolean {
  return e instanceof JefersonRebuildServerTimeoutError;
}

export async function withJefersonRebuildServerTimeout<T>(
  ms: number,
  fn: () => Promise<T>
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new JefersonRebuildServerTimeoutError()), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
