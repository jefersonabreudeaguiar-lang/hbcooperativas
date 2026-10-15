import { buildCooperadoLoginPath } from "@/lib/cooperado/cooperadoCanonicalEntryUrl";

/**
 * Decisão do guard inline no ícone (WebAPK) — evita mandar todo mundo ao pwa-rescue
 * (purge agressivo) quando só faltam flags de reparo na sessão.
 */

export type PwaStandaloneLaunchDecision =
  | { action: "allow" }
  | { action: "launch"; nextPath: string };

export function evaluatePwaStandaloneLaunchGuard(input: {
  pageBuild: number;
  seenBuild: number;
  repairSessionOk: boolean;
  repairLocalOk: boolean;
  nextPath: string;
}): PwaStandaloneLaunchDecision {
  const { pageBuild, seenBuild, repairSessionOk, repairLocalOk, nextPath } = input;
  const repairOk = repairSessionOk || repairLocalOk;
  const buildOk = !seenBuild || seenBuild >= pageBuild - 1;
  const veryStale = seenBuild > 0 && seenBuild < pageBuild - 1;
  const loginNext = buildCooperadoLoginPath(pageBuild);

  if (repairOk && buildOk) return { action: "allow" };
  if (!buildOk || veryStale) {
    return { action: "launch", nextPath: loginNext };
  }

  const path =
    nextPath && nextPath !== "/" ? nextPath : loginNext;
  return { action: "launch", nextPath: path };
}
