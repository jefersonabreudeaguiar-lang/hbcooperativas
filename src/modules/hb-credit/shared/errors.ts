export class HbCreditDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HbCreditDomainError";
  }
}

export class HbCreditStateTransitionError extends HbCreditDomainError {
  constructor(from: string, to: string, entity: string) {
    super(`Transição inválida ${entity}: ${from} → ${to}`);
    this.name = "HbCreditStateTransitionError";
  }
}

export class HbCreditIsolationError extends HbCreditDomainError {
  constructor(message = "Cooperativa não autorizada para este recurso.") {
    super(message);
    this.name = "HbCreditIsolationError";
  }
}
