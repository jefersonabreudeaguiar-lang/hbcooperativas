import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function ignoreOfficialV1Build(env) {
  return env.VERCEL_PROJECT_ID !== "prj_LZM7D77Y8jXAWf6hTImOKhinAAUT"
    || env.NEXT_PUBLIC_SUPABASE_URL !== "https://ifptyzikekrswippzmsf.supabase.co"
    || env.HB_HOMOLOGATION_ONLY === "true";
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const ignored = ignoreOfficialV1Build(process.env);
  console.log(ignored ? "Publicação V1 bloqueada fora do projeto e banco oficiais." : "Projeto e banco oficiais confirmados para a publicação V1.");
  process.exit(ignored ? 0 : 1);
}
