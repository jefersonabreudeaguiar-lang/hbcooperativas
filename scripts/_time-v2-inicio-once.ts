import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));

const CNPJ = "62351750000165";
const ORLANDO = "c_1782263929381_ncp55";

async function main() {
  const { buildCooperadoV2CloudAppData } = await import(
    "../src/lib/cooperado-v2/server/buildCooperadoV2CloudAppData"
  );
  const t0 = Date.now();
  const r = await buildCooperadoV2CloudAppData(CNPJ);
  console.log("build ms", Date.now() - t0, "ok", !!r);

  const { fetchCooperadoV2InicioCardFromCloud } = await import(
    "../src/lib/cooperado-v2/server/cooperadoV2InicioCard"
  );
  const t1 = Date.now();
  const card = await fetchCooperadoV2InicioCardFromCloud(CNPJ, ORLANDO);
  console.log("card ms", Date.now() - t1, "valor", card?.card?.valor);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
