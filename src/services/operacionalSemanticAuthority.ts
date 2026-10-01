/**
 * SYNC-001/S5 — contrato de prioridade (implementação nos merges especializados; sem motor paralelo).
 *
 * 1. Autoridade da fonte (ex.: hb_credit_transactions / SQL HB)
 * 2. Completude do payload (operacionalSnapshotComplete, S1/S4)
 * 3. Autoridade semântica do domínio (status, NOT-001, monotonicidade pagamento)
 * 4. Estado / status (ficha pago, nota conferida)
 * 5. Regras financeiras / monotonicidade (PAY-TMP-001, preservar confirmado)
 * 6. updatedAt (desempate)
 * 7. Desempate determinístico (id, pagoEm, reciboHtml)
 *
 * Coleções genéricas sem rank semântico (ex.: desconto manual, ajustes) usam
 * `mergeOperacionalArrayFromCloud` — updatedAt só desempata após S1/S4 autorizarem o domínio.
 */

export {
  mergePagamentoCooperadoRecord,
  mergePagamentosCooperadoFromCloud,
  mergePagamentoRegistro,
} from "@/services/pagamentoRegistroMerge";

export { mergeContaCoopDescontosFieldSync } from "@/lib/hb-credit/mergeFichaDescontos";

export { mergeNotaComFotos } from "@/utils/fotoEntrega";
