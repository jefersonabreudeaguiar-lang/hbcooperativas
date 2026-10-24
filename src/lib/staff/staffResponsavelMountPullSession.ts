/** Evita 2º pull pesado quando Conferir remonta no keep-alive (mesma sessão / cooperativa). */
const pulledCoopIds = new Set<string>();

export function staffResponsavelMountPullJaFeito(coopId: string): boolean {
  return pulledCoopIds.has(coopId);
}

export function marcarStaffResponsavelMountPullFeito(coopId: string): void {
  if (!coopId) return;
  pulledCoopIds.add(coopId);
}

export function resetStaffResponsavelMountPullSessionForTests(): void {
  pulledCoopIds.clear();
}
