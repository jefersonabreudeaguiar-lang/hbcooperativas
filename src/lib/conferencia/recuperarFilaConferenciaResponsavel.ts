import { limparMarcasConferenciaDecididaLocalmenteParaRecuperacao } from "@/lib/conferencia/conferenciaFilaDecisaoLocal";
import { syncNotasPedidoFromCloudStaffCoalesced } from "@/lib/performance/staffNotasPullCoordinator";
import { clearNotasSyncMeta, forceNextFullNotasSync } from "@/services/syncMetaService";
import { normalizeCnpj } from "@/utils/cooperativa";

const RESP_FULL_NOTAS_SESSION = "hb_resp_full_notas_session_v1";

/** Repuxa todas as entregas da nuvem — fila Conferir vazia com dados na nuvem. */
export async function recuperarFilaConferenciaResponsavelDaNuvem(cnpj: string): Promise<number> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return 0;

  limparMarcasConferenciaDecididaLocalmenteParaRecuperacao();
  clearNotasSyncMeta(digits);
  forceNextFullNotasSync(digits);

  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(`${RESP_FULL_NOTAS_SESSION}:${digits}`);
    sessionStorage.removeItem(`hb_repair_fila_done:${digits}:v2`);
  }

  return syncNotasPedidoFromCloudStaffCoalesced(digits, { retryFull: true });
}
