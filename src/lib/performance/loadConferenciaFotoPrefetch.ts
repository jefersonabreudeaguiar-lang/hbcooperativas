/**
 * Etapa 4 P0 — download/cache de fotos na conferência sob demanda.
 * Prefetch aquece o chunk ao entrar na fila ou abrir conferência.
 */

let prefetchModule: Promise<typeof import("@/services/conferenciaFotoPrefetch")> | null = null;
let prefetchModuleResolved: typeof import("@/services/conferenciaFotoPrefetch") | null = null;

export function prefetchConferenciaFotoPrefetchModule(): void {
  if (typeof window === "undefined") return;
  if (!prefetchModule) {
    prefetchModule = import("@/services/conferenciaFotoPrefetch").then((m) => {
      prefetchModuleResolved = m;
      return m;
    });
  }
}

export async function loadConferenciaFotoPrefetchModule(): Promise<
  typeof import("@/services/conferenciaFotoPrefetch")
> {
  prefetchConferenciaFotoPrefetchModule();
  if (prefetchModuleResolved) return prefetchModuleResolved;
  const mod = await (prefetchModule ?? import("@/services/conferenciaFotoPrefetch"));
  prefetchModuleResolved = mod;
  return mod;
}

/** Leitura síncrona do cache global — só após o chunk ter sido carregado uma vez. */
export function getConferenciaFotoBlobCachedIfLoaded(
  cnpj: string,
  notaId: string,
  index: number,
  preview = true
): string | undefined {
  return prefetchModuleResolved?.getConferenciaFotoBlobCached(cnpj, notaId, index, preview);
}
