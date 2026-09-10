import type { CreditAccountRow, CreditProbeSnapshot } from "./types";
import { buildSnapshotPayloadHash } from "./fingerprint";

export function compareWithPreviousSnapshot(
  currentAccounts: CreditAccountRow[],
  previous: CreditProbeSnapshot | null
): { status: CreditProbeSnapshot["status"]; payloadHash: string; changedLegitimately: boolean } {
  const payloadHash = buildSnapshotPayloadHash(
    currentAccounts.map((a) => ({
      accountId: a.accountId,
      limitCents: a.limitCents,
      usedCents: a.usedCents,
      availableCents: a.availableCents,
    }))
  );

  if (!previous) {
    return { status: "OK", payloadHash, changedLegitimately: false };
  }

  if (previous.payloadHash === payloadHash) {
    return { status: "OK", payloadHash, changedLegitimately: false };
  }

  return { status: "CHANGED_OK", payloadHash, changedLegitimately: true };
}
