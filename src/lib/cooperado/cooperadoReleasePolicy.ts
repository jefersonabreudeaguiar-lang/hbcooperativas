import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

export type CooperadoReleasePolicy = {
  minBuild: number;
  recommendedBuild: number;
  releaseEpoch: number;
  message: string;
  serverBuild: number;
};

const DEFAULT_MESSAGE = "";

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(String(raw ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Política embutida no bundle — fallback se a API falhar (sempre exige build atual). */
export function embeddedCooperadoReleasePolicy(): CooperadoReleasePolicy {
  const serverBuild = APP_BUILD_VERSION;
  return {
    minBuild: serverBuild,
    recommendedBuild: serverBuild,
    releaseEpoch: serverBuild,
    message: DEFAULT_MESSAGE,
    serverBuild,
  };
}

/**
 * Política de release cooperado (servidor).
 * minBuild e releaseEpoch nunca ficam abaixo do build do bundle — todo deploy força atualização cooperado.
 */
export function resolveCooperadoReleasePolicy(): CooperadoReleasePolicy {
  const serverBuild = APP_BUILD_VERSION;
  const envMin = parsePositiveInt(process.env.COOPERADO_MIN_BUILD, serverBuild);
  const envEpoch = parsePositiveInt(process.env.COOPERADO_RELEASE_EPOCH, serverBuild);
  const minBuild = Math.max(envMin, serverBuild);
  const releaseEpoch = Math.max(envEpoch, serverBuild);
  const recommendedBuild = Math.max(
    parsePositiveInt(process.env.COOPERADO_RECOMMENDED_BUILD, serverBuild),
    minBuild
  );
  const message = (process.env.COOPERADO_RELEASE_MESSAGE ?? DEFAULT_MESSAGE).trim() || DEFAULT_MESSAGE;
  return {
    minBuild,
    recommendedBuild,
    releaseEpoch,
    message,
    serverBuild,
  };
}

export function mergeCooperadoReleasePolicy(
  remote: CooperadoReleasePolicy | null | undefined
): CooperadoReleasePolicy {
  const embedded = embeddedCooperadoReleasePolicy();
  if (!remote) return embedded;
  return {
    minBuild: Math.max(remote.minBuild ?? 0, embedded.minBuild),
    recommendedBuild: Math.max(remote.recommendedBuild ?? 0, embedded.recommendedBuild),
    releaseEpoch: Math.max(remote.releaseEpoch ?? 0, embedded.releaseEpoch),
    message: remote.message?.trim() || embedded.message,
    serverBuild: Math.max(remote.serverBuild ?? 0, embedded.serverBuild),
  };
}

export function cooperadoClientBuildMeetsMin(
  clientBuild: number,
  policy: Pick<CooperadoReleasePolicy, "minBuild">
): boolean {
  return clientBuild >= policy.minBuild;
}
