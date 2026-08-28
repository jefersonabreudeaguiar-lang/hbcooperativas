import { HbCreditIsolationError } from "../shared/errors";

export function assertSameCooperative(resourceCnpj: string, requestCnpj: string): void {
  const a = resourceCnpj.replace(/\D/g, "");
  const b = requestCnpj.replace(/\D/g, "");
  if (a.length !== 14 || b.length !== 14 || a !== b) {
    throw new HbCreditIsolationError();
  }
}

export function normalizeCooperativeCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}
