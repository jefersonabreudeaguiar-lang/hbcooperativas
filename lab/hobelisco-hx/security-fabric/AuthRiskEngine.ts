/** T01 — Authentication Risk Engine (sinais determinísticos, LAB) */

export type AuthRiskSignal =
  | "authFailureBurst"
  | "authVelocity"
  | "sessionCreationBurst"
  | "identityMismatch"
  | "authorizationMismatch"
  | "tokenStateMismatch"
  | "concurrentSessionAnomaly";

export interface AuthRiskInput {
  failures: number;
  windowMs: number;
  identityState: string;
  route: string;
  sequence: string[];
}

export interface AuthRiskResult {
  score: number;
  signals: AuthRiskSignal[];
  explanation: string;
  wouldBlock: boolean;
}

export function evaluateAuthRisk(input: AuthRiskInput): AuthRiskResult {
  const signals: AuthRiskSignal[] = [];
  let score = 0;

  if (input.failures >= 5) {
    signals.push("authFailureBurst");
    score += Math.min(40, input.failures * 2);
  }
  if (input.failures >= 10 && input.windowMs < 60_000) {
    signals.push("authVelocity");
    score += 20;
  }
  if (input.sequence.some((s) => s.includes("concurrent"))) {
    signals.push("concurrentSessionAnomaly");
    score += 15;
  }
  if (input.identityState === "anonymous" && input.route.includes("/admin")) {
    signals.push("authorizationMismatch");
    score += 25;
  }
  if (input.identityState === "expired_session") {
    signals.push("tokenStateMismatch");
    score += 20;
  }
  if (input.sequence.some((s) => s.includes("mismatch"))) {
    signals.push("identityMismatch");
    score += 15;
  }

  return {
    score: Math.min(100, score),
    signals,
    explanation: signals.length ? signals.join(", ") : "no_auth_risk",
    wouldBlock: score >= 35,
  };
}
