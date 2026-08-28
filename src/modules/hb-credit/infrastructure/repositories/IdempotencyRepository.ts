import type { HbCreditIdempotencyRecord } from "../../domain/entities";

export interface IdempotencyRepository {
  find(
    cooperativeCnpj: string,
    scope: string,
    idempotencyKey: string
  ): Promise<HbCreditIdempotencyRecord | null>;

  save(record: HbCreditIdempotencyRecord): Promise<void>;
}

/** Fase 0: contrato de persistência — implementação Supabase em fase posterior. */
export class UnimplementedIdempotencyRepository implements IdempotencyRepository {
  async find(): Promise<HbCreditIdempotencyRecord | null> {
    return null;
  }

  async save(): Promise<void> {
    throw new Error("IdempotencyRepository não implementado na Fase 0.");
  }
}
