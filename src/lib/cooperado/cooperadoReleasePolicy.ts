import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

export type CooperadoReleasePolicy = {
  minBuild: number;
  recommendedBuild: number;
  releaseEpoch: number;
  message: string;
  serverBuild: number;
};

const DEFAULT_MESSAGE =
  "Nova versão do app. Aguarde a sincronização com a cooperativa para ver A receber, Financeiro e HB Créditos atualizados.";

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(String(raw ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Política de release cooperado (servidor). */
export function resolveCooperadoReleasePolicy(): CooperadoReleasePolicy {
  const serverBuild = APP_BUILD_VERSION;
  const minBuild = parsePositiveInt(process.env.COOPERADO_MIN_BUILD, serverBuild);
  const recommendedBuild = parsePositiveInt(
    process.env.COOPERADO_RECOMMENDED_BUILD,
    serverBuild
  );
  const releaseEpoch = parsePositiveInt(process.env.COOPERADO_RELEASE_EPOCH, 1);
  const message = (process.env.COOPERADO_RELEASE_MESSAGE ?? DEFAULT_MESSAGE).trim() || DEFAULT_MESSAGE;
  return {
    minBuild: Math.max(minBuild, 1),
    recommendedBuild: Math.max(recommendedBuild, minBuild),
    releaseEpoch,
    message,
    serverBuild,
  };
}

export function cooperadoClientBuildMeetsMin(
  clientBuild: number,
  policy: Pick<CooperadoReleasePolicy, "minBuild">
): boolean {
  return clientBuild >= policy.minBuild;
}
