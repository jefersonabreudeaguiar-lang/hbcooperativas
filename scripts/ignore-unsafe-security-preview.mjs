import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function ignoreSecurityPreview(env) {
  if (env.VERCEL_GIT_COMMIT_REF !== "codex/seguranca-etapa-1") return false;
  return env.VERCEL_PROJECT_ID !== "prj_1dqke8xRjtzsCouFEczEB4ZgmF10"
    || env.NEXT_PUBLIC_SUPABASE_URL !== "https://ocyfzramxvxqbtkorubn.supabase.co"
    || env.HB_HOMOLOGATION_ONLY !== "true";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  // Contrato da Vercel: 0 ignora a implantação; 1 permite continuar.
  const ignore = ignoreSecurityPreview(process.env);
  console.log(ignore ? "Candidato bloqueado fora da homologação isolada." : "Projeto permitido pelo controle de isolamento.");
  process.exit(ignore ? 0 : 1);
}
