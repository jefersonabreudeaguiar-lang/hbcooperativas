/** T06 — Session Guard (replay conservador, LAB) */

export interface SessionGuardInput {
  sessionId?: string;
  requestId?: string;
  sequence: string[];
  route: string;
  timestampMs: number;
  priorTimestampMs?: number;
}

export interface SessionGuardResult {
  anomaly: boolean;
  replaySuspected: boolean;
  explanation: string;
  wouldBlock: boolean;
}

export function evaluateSessionGuard(input: SessionGuardInput): SessionGuardResult {
  const replaySuspected =
    input.sequence.some((s) => s.includes("replay") || s.includes("fixation")) ||
    (input.priorTimestampMs != null && input.timestampMs - input.priorTimestampMs < 50);

  const anomaly =
    replaySuspected ||
    input.sequence.some((s) => s.includes("concurrent") || s.includes("expired") || s.includes("revoked"));

  return {
    anomaly,
    replaySuspected,
    explanation: replaySuspected ? "replay_or_fixation" : anomaly ? "session_anomaly" : "session_ok",
    wouldBlock: replaySuspected,
  };
}
