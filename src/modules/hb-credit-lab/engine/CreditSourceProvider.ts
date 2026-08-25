/**
 * Contrato futuro: origem de crédito a partir de vendas/entregas.
 * NÃO CONECTADO ao fluxo operacional atual (Ficha Corrida / entregas).
 */
export interface CreditSourceSnapshot {
  cooperadoId: string;
  periodoReferencia: string;
  valorElegivelCents: number;
  origem: "entrega" | "ajuste_manual" | "laboratorio";
  referenciaId: string;
}

export interface CreditSourceProvider {
  /** Futuro: listar fontes elegíveis sem alterar Ficha Corrida. */
  listEligibleSources(_cooperadoId: string): Promise<CreditSourceSnapshot[]>;
}

/** Stub isolado — retorna vazio; nenhuma integração com produção. */
export const creditSourceProviderStub: CreditSourceProvider = {
  async listEligibleSources() {
    return [];
  },
};
