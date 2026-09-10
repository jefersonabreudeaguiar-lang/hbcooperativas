/** Isolamento lógico por cooperativa (lab) */

export function assertCooperativeScope(
  eventCnpj: string | undefined,
  operationCnpj: string
): { ok: true } | { ok: false; reason: string } {
  if (!eventCnpj?.trim()) {
    return { ok: false, reason: "COOPERATIVE_ISOLATION: evento sem CNPJ" };
  }
  const a = eventCnpj.replace(/\D/g, "");
  const b = operationCnpj.replace(/\D/g, "");
  if (a !== b) {
    return { ok: false, reason: `COOPERATIVE_ISOLATION: ${a} ≠ ${b}` };
  }
  return { ok: true };
}

export function memoryBelongsToCooperative(
  memoryContext: string,
  cooperativeCnpj: string
): boolean {
  const digits = cooperativeCnpj.replace(/\D/g, "");
  return memoryContext.includes(digits) || memoryContext === "lab";
}
