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

/** Após sync em background ao abrir anexar — evita pull pesado de novo no botão Enviar. */
const ENVIO_SYNC_FRESH_TTL_MS = 120_000;
let lastCooperadoEnvioSyncFreshAt = 0;

export function markCooperadoEnvioSyncFresh(): void {
  lastCooperadoEnvioSyncFreshAt = Date.now();
}

export function shouldSkipCooperadoEnvioSyncOnSubmit(notaRejeitada?: NotaPedido): boolean {
  if (notaRejeitada?.id) return false;
  if (lastCooperadoEnvioSyncFreshAt <= 0) return false;
  return Date.now() - lastCooperadoEnvioSyncFreshAt < ENVIO_SYNC_FRESH_TTL_MS;
}

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

  if (opts?.reason === "anexar") {
    void (async () => {
      try {
        await syncNotasPedidoFromCloud(cnpj, { retryFull: false });
        try {
          await syncContratosFromCloud(cnpj);
        } catch {
          /* contratos locais */
        }
        markCooperadoEnvioSyncFresh();
      } catch {
        /* não bloqueia abertura da câmera — submit valida de novo */
      }
    })();
    return { ok: true };
  }

  if (opts?.reason === "submit" && shouldSkipCooperadoEnvioSyncOnSubmit(opts.notaRejeitada)) {
    return { ok: true };
  }

  /** Sync incremental no envio normal; full só em reenvio após rejeição. */
  const retryFull = Boolean(opts?.notaRejeitada?.id);
  try {
    await syncNotasPedidoFromCloud(cnpj, { retryFull });
    try {
      await syncContratosFromCloud(cnpj);
    } catch {
      /* offline — contratos locais */
    }
    markCooperadoEnvioSyncFresh();
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Não foi possível atualizar suas entregas. Verifique a internet e tente de novo.",
    };
  }
}
