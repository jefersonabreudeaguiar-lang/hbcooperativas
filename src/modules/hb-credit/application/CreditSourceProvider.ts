/**
 * Adaptador futuro Ficha Corrida → HB Créditos.
 * Fase 0: stub isolado — não chamar, não integrar, não importar dados operacionais.
 */
export interface CreditSourceSnapshot {
  cooperadoId: string;
  cooperativeCnpj: string;
  suggestedLimitCents: number;
  referencePeriod?: string;
}

export interface CreditSourceProvider {
  /** Reservado para fase futura — retorna vazio nesta fundação. */
  getApprovedCreditSources(_cooperativeCnpj: string): Promise<CreditSourceSnapshot[]>;
}

export class NullCreditSourceProvider implements CreditSourceProvider {
  async getApprovedCreditSources(): Promise<CreditSourceSnapshot[]> {
    return [];
  }
}

export const creditSourceProvider: CreditSourceProvider = new NullCreditSourceProvider();
