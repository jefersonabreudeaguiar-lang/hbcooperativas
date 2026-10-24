/** Evita tela presa em skeleton quando a API HB demora ou trava. */

export async function withContaCoopFetchTimeout<T>(
  promise: Promise<T>,
  ms = 28_000,
  message = "A operação demorou demais. Verifique a conexão e tente novamente."
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
