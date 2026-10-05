/**
 * Etapa 18 P4 — carrega compressão/upload de fotos sob demanda (cooperado).
 * Prefetch aquece o chunk após UI interativa ou ao abrir envio.
 */

let pipelineModule: Promise<typeof import("@/services/imagePipelineService")> | null = null;

export function prefetchCooperadoAnexarPipeline(): void {
  if (typeof window === "undefined") return;
  if (!pipelineModule) {
    pipelineModule = import("@/services/imagePipelineService");
  }
}

export async function loadCooperadoAnexarPipeline(): Promise<
  typeof import("@/services/imagePipelineService")
> {
  prefetchCooperadoAnexarPipeline();
  return pipelineModule ?? import("@/services/imagePipelineService");
}
