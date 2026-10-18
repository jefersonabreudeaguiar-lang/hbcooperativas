import type { AppData } from "@/types";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";

/** Cleones Sousa Burmann — CoopeagriPla; ficha multi-foto legítima aciona gate de “desalinhamento”. */
export const COOPERADO_CLEONES_SOUSA_BURMANN_ID = "c_1785867836463_qsr08";

export function cooperadoIdCanonicoEhCleonesSousaBurmann(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string
): boolean {
  const canon = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  return (
    canon === COOPERADO_CLEONES_SOUSA_BURMANN_ID || cooperadoId === COOPERADO_CLEONES_SOUSA_BURMANN_ID
  );
}

/** Caso isolado: não bloquear app/sync por duplicata aparente na ficha (várias fotos por nota). */
export function cooperadoCleonesIgnoraGateFichaDesalinhada(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string
): boolean {
  return cooperadoIdCanonicoEhCleonesSousaBurmann(data, cooperadoId, cooperativaId);
}
