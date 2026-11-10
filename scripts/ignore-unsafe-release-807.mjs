import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function ignoreRelease807Build(env) {
  if (env.VERCEL_GIT_COMMIT_REF !== 'codex/hb-staff-load-807') return true;
  const homolog = env.VERCEL_PROJECT_ID === 'prj_1dqke8xRjtzsCouFEczEB4ZgmF10'
    && env.NEXT_PUBLIC_SUPABASE_URL === 'https://ocyfzramxvxqbtkorubn.supabase.co'
    && env.HB_HOMOLOGATION_ONLY === 'true' && env.VERCEL_ENV === 'preview';
  const official = env.VERCEL_PROJECT_ID === 'prj_LZM7D77Y8jXAWf6hTImOKhinAAUT'
    && env.NEXT_PUBLIC_SUPABASE_URL === 'https://ifptyzikekrswippzmsf.supabase.co'
    && env.HB_HOMOLOGATION_ONLY !== 'true' && env.VERCEL_ENV === 'production';
  return !homolog && !official;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const ignored = ignoreRelease807Build(process.env);
  console.log(ignored ? 'Candidata 807 bloqueada: projeto, banco, ambiente ou branch incorretos.' : 'Destino da candidata 807 conferido.');
  process.exit(ignored ? 0 : 1);
}




