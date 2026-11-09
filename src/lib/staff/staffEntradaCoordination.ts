/** Entry has priority over new background jobs; existing writes must finish normally. */
let entries = 0;
export function staffEntradaEmAndamento(): boolean { return entries > 0; }
export function iniciarStaffEntrada(): () => void {
  entries++;
  let released = false;
  return () => { if (!released) { released = true; entries = Math.max(0, entries - 1); } };
}
export async function aguardarEscritasStaff(
  ocupada: () => boolean,
  ativa: () => boolean,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (ocupada()) {
    if (!ativa()) throw Error('Entrada cancelada.');
    if (Date.now() >= deadline) throw Error('Uma atualização anterior ainda está terminando neste navegador. Aguarde alguns segundos e tente novamente.');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ativa()) throw Error('Entrada cancelada.');
}
