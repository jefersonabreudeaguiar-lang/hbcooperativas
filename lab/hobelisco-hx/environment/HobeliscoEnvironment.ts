/** Contrato de ambiente HOBELISCO — LAB | STAGING | PRODUCTION */

export type HobeliscoEnvironment = "LAB" | "STAGING" | "PRODUCTION";

const ALLOWED: HobeliscoEnvironment[] = ["LAB", "STAGING", "PRODUCTION"];

export interface EnvironmentBehavior {
  environment: HobeliscoEnvironment;
  simulationAllowed: boolean;
  observation: boolean;
  mutation: false;
  observerEnabled: boolean;
}

export function parseHobeliscoEnvironment(raw: string | undefined): HobeliscoEnvironment | "UNKNOWN" {
  if (!raw?.trim()) return "UNKNOWN";
  const v = raw.trim().toUpperCase() as HobeliscoEnvironment;
  return ALLOWED.includes(v) ? v : "UNKNOWN";
}

export function resolveHobeliscoEnvironment(env: NodeJS.ProcessEnv = process.env): HobeliscoEnvironment {
  const explicit = parseHobeliscoEnvironment(env.HOBELISCO_ENVIRONMENT);
  if (explicit !== "UNKNOWN") return explicit;

  if (env.NODE_ENV === "production") {
    const stagingHint = ["true", "1", "yes"].includes(
      (env.HB_HOBELISCO_STAGING_ENABLED ?? "").trim().toLowerCase()
    );
    if (stagingHint && env.VERCEL_ENV === "preview") return "STAGING";
    return "PRODUCTION";
  }

  return "LAB";
}

export function getEnvironmentBehavior(environment: HobeliscoEnvironment): EnvironmentBehavior {
  switch (environment) {
    case "LAB":
      return {
        environment,
        simulationAllowed: true,
        observation: true,
        mutation: false,
        observerEnabled: true,
      };
    case "STAGING":
      return {
        environment,
        simulationAllowed: false,
        observation: true,
        mutation: false,
        observerEnabled: true,
      };
    case "PRODUCTION":
      return {
        environment,
        simulationAllowed: false,
        observation: false,
        mutation: false,
        observerEnabled: false,
      };
    default:
      return {
        environment: "LAB",
        simulationAllowed: false,
        observation: false,
        mutation: false,
        observerEnabled: false,
      };
  }
}

export function validateEnvironmentBootstrap(env: NodeJS.ProcessEnv = process.env): {
  environment: HobeliscoEnvironment | "UNKNOWN";
  behavior: EnvironmentBehavior;
  safeMode: boolean;
} {
  const parsed = parseHobeliscoEnvironment(env.HOBELISCO_ENVIRONMENT);
  if (parsed === "UNKNOWN" && !env.NODE_ENV) {
    return {
      environment: "UNKNOWN",
      behavior: getEnvironmentBehavior("LAB"),
      safeMode: true,
    };
  }
  const environment = resolveHobeliscoEnvironment(env);
  return {
    environment,
    behavior: getEnvironmentBehavior(environment),
    safeMode: parsed === "UNKNOWN",
  };
}
