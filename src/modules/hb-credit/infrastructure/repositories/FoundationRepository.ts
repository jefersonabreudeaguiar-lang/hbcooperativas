import { assertHbCreditEnabledServer, HbCreditDisabledError } from "../../shared/config";

/** Fase 0: repositórios concretos lançam se flag off — fail-closed. */
export abstract class HbCreditFoundationRepository {
  protected assertOperational(): void {
    try {
      assertHbCreditEnabledServer();
    } catch (e) {
      if (e instanceof HbCreditDisabledError) throw e;
      throw e;
    }
  }
}
