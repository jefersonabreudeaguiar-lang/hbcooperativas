import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

const ACK_KEY = "hb.coop.postDeployAck.v1";
const QUEUE_ACTIVE_KEY = "hb.coop.postDeployQueueActive";

export type CooperadoPostDeployAck = {
  build: number;
  epoch: number;
  at: string;
};

let queueActive = false;

export function cooperadoPostDeployQueueActive(): boolean {
  if (typeof window === "undefined") return queueActive;
  if (queueActive) return true;
  try {
    return sessionStorage.getItem(QUEUE_ACTIVE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setCooperadoPostDeployQueueActive(active: boolean): void {
  queueActive = active;
  if (typeof sessionStorage === "undefined") return;
  try {
    if (active) sessionStorage.setItem(QUEUE_ACTIVE_KEY, "1");
    else sessionStorage.removeItem(QUEUE_ACTIVE_KEY);
  } catch {
    /* quota */
  }
}

export function readCooperadoPostDeployAck(): CooperadoPostDeployAck | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CooperadoPostDeployAck;
    if (!parsed?.epoch || !parsed.build) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function cooperadoPostDeployAckMatches(build: number, epoch: number): boolean {
  const ack = readCooperadoPostDeployAck();
  if (!ack) return false;
  return ack.build === build && ack.epoch === epoch;
}

export function markCooperadoPostDeployAck(epoch: number, build = APP_BUILD_VERSION): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      ACK_KEY,
      JSON.stringify({ build, epoch, at: new Date().toISOString() } satisfies CooperadoPostDeployAck)
    );
  } catch {
    /* quota */
  }
}

export function cooperadoPostDeployUiReady(releaseEpoch?: number): boolean {
  const ack = readCooperadoPostDeployAck();
  if (!ack) return false;
  if (ack.build !== APP_BUILD_VERSION) return false;
  if (releaseEpoch != null && ack.epoch !== releaseEpoch) return false;
  return true;
}
