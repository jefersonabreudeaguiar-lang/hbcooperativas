import type { User } from "@/types";
import { grantCooperadoEventDrivenSync } from "@/lib/performance/cooperadoEventDrivenSync";
import { runCooperadoForegroundOperacionalCheck } from "@/lib/performance/cooperadoForegroundOperacionalSync";
import { cooperadoMobilePilotPostEnvioForegroundSync } from "@/lib/cooperado/cooperadoMobilePilotPerf";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";

/** Piloto: após enviar entrega, puxa revisão em background (responsável vê mais cedo). */
export async function scheduleCooperadoPilotPostEnvioSync(
  user: Omit<User, "password">,
  cooperativaId: string
): Promise<void> {
  if (!cooperadoMobilePilotPostEnvioForegroundSync(user)) return;
  if (!isAppDataWarm()) return;
  grantCooperadoEventDrivenSync();
  const data = getData();
  if (!data) return;
  const cnpj = await resolveCooperativaCnpj(data, cooperativaId, user);
  if (!cnpj) return;
  const coopId = getUserCooperativaId(user, data) ?? cooperativaId;
  const cooperadoId = user.cooperadoId
    ? resolverCooperadoIdCanonico(data, user.cooperadoId, coopId)
    : undefined;
  void runCooperadoForegroundOperacionalCheck(cnpj, {
    cooperadoId,
    cooperativaId: coopId,
  });
}
