import { COOPERADO_FINANCEIRO_TAB_HREF } from "@/lib/hb-credit/hbCreditNavPrefetch";

let financeiroChunkWarm = false;

/** Aquece o JS da aba Financeiro antes do toque (cooperado mobile). */
export function warmupCooperadoFinanceiroTabChunk(): void {
  if (financeiroChunkWarm || typeof window === "undefined") return;
  financeiroChunkWarm = true;
  if (COOPERADO_FINANCEIRO_TAB_HREF === "/ficha-corrida") {
    void import("@/app/(app)/ficha-corrida/FichaCorridaContent");
  }
}
