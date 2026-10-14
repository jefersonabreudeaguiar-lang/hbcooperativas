/**
 * Diagnóstico estático: piloto Jeferson está bem configurado no código?
 * npx tsx scripts/diag-piloto-jeferson-identidade.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COOPERADO_MOBILE_PILOT_COOPERADO_ID,
  COOPERADO_MOBILE_PILOT_EMAIL,
  isCooperadoMobilePilot,
} from "../src/lib/cooperado/cooperadoMobilePilot";
import {
  COOPERADO_MOBILE_PILOT_PENDING_REVISION,
  COOPERADO_MOBILE_PILOT_PROMOTED_REVISION,
} from "../src/lib/cooperado/cooperadoMobilePilotIndicator";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

function main() {
  const link = readFileSync(
    join(ROOT, "src/lib/hb-credit/mobileCooperadoLink.ts"),
    "utf8"
  );
  const emailNorm = COOPERADO_MOBILE_PILOT_EMAIL.toLowerCase();
  const linkOk =
    link.includes(emailNorm) && link.includes(COOPERADO_MOBILE_PILOT_COOPERADO_ID);

  const jef = {
    id: "diag",
    role: "cooperado" as const,
    email: COOPERADO_MOBILE_PILOT_EMAIL,
    cooperadoId: COOPERADO_MOBILE_PILOT_COOPERADO_ID,
    cooperativaId: "coop_diag",
  };
  const outro = { ...jef, email: "outro@example.com", cooperadoId: "c_outro" };

  console.log("=== Piloto Jeferson — identidade no código ===");
  console.log("email piloto:", COOPERADO_MOBILE_PILOT_EMAIL);
  console.log("cooperadoId piloto:", COOPERADO_MOBILE_PILOT_COOPERADO_ID);
  console.log("mobileCooperadoLink alinhado:", linkOk ? "SIM" : "NÃO");
  console.log("isCooperadoMobilePilot(Jeferson):", isCooperadoMobilePilot(jef));
  console.log("isCooperadoMobilePilot(outro):", isCooperadoMobilePilot(outro));
  console.log("APP_BUILD_VERSION (bundle):", APP_BUILD_VERSION);
  console.log(
    "Revisão piloto PENDING/PROMOTED:",
    COOPERADO_MOBILE_PILOT_PENDING_REVISION,
    "/",
    COOPERADO_MOBILE_PILOT_PROMOTED_REVISION,
    "→ estrela:",
    COOPERADO_MOBILE_PILOT_PENDING_REVISION > COOPERADO_MOBILE_PILOT_PROMOTED_REVISION
      ? "SIM"
      : "não"
  );
  console.log("");
  console.log("No celular do Jeferson (produção):");
  console.log("- Estrela amarela no header = sessão piloto + revisão", COOPERADO_MOBILE_PILOT_PENDING_REVISION, "no bundle instalado");
  console.log("- <html data-cooperado-pilot-perf=\"1\"> = perf piloto ativo");
  console.log("- v" + APP_BUILD_VERSION + " no header = build do JS carregado");
  console.log("- Se revisão no código local > no ar: falta commit/push/deploy ou PWA em cache");
}

main();
