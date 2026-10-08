/**
 * Cooperado PWA mobile — pull de notas/contratos imediatamente antes de anexar ou enviar fotos.
 */
import type { User } from "@/types";
import type { NotaPedido } from "@/types";
import { isCooperadoPwaMobileEntregasSyncDeferUntilEnvio } from "@/lib/cooperado/cooperadoPwaMobileEntregas";
import { grantCooperadoEventDrivenSync } from "@/lib/performance/cooperadoEventDrivenSync";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { resolveCooperativaCnpj, syncNotasPedidoFromCloud } from "@/services/notaPedidoCloudService";
import { syncContratosFromCloud } from "@/services/cooperativaSyncCloudService";

export type CooperadoPwaEnvioSyncReason = "anexar" | "submit";

export type CooperadoPwaEnvioSyncResult = {
  ok: boolean;
  error?: string;
};

export async function ensureCooperadoNotasFreshForEnvio(
  user: Omit<User, "password">,
  coopId: string,
  opts?: { reason?: CooperadoPwaEnvioSyncReason; notaRejeitada?: NotaPedido }
): Promise<CooperadoPwaEnvioSyncResult> {
  if (!isCooperadoPwaMobileEntregasSyncDeferUntilEnvio()) return { ok: true };
  if (user.role !== "cooperado") return { ok: true };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return {
      ok: false,
      error: "Sem internet. Conecte-se para atualizar as entregas antes de enviar fotos.",
    };
  }

  grantCooperadoEventDrivenSync();
  if (!isAppDataWarm()) {
    return { ok: false, error: "Dados locais ainda carregando. Aguarde um instante e tente de novo." };
  }
  const data = getData();
  if (!data) {
    return { ok: false, error: "Dados locais indisponíveis. Toque em Atualizar." };
  }
  const cnpj = await resolveCooperativaCnpj(data, coopId, user);
  if (!cnpj) {
    return {
      ok: false,
      error: "CNPJ da cooperativa não encontrado. Toque em Atualizar ou faça login novamente.",
    };
  }

  const retryFull = opts?.reason === "submit" || Boolean(opts?.notaRejeitada?.id);
  try {
    await syncNotasPedidoFromCloud(cnpj, { retryFull });
    try {
      await syncContratosFromCloud(cnpj);
    } catch {
      /* offline — contratos locais */
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Não foi possível atualizar suas entregas. Verifique a internet e tente de novo.",
    };
  }
}
