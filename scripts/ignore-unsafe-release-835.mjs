import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function ignoreRelease835Build(env) {
  const release835 = env.VERCEL_GIT_COMMIT_REF === 'codex/hb-aprovar-proxima-835';
  const releaseLivroCaixa = env.VERCEL_GIT_COMMIT_REF === 'codex/livro-caixa-publicacao';
  if (!release835 && !releaseLivroCaixa) return true;
  const homolog = release835 && env.VERCEL_PROJECT_ID === 'prj_1dqke8xRjtzsCouFEczEB4ZgmF10'
    && env.NEXT_PUBLIC_SUPABASE_URL === 'https://ocyfzramxvxqbtkorubn.supabase.co'
    && env.HB_HOMOLOGATION_ONLY === 'true' && env.VERCEL_ENV === 'preview';
  const official = env.VERCEL_PROJECT_ID === 'prj_LZM7D77Y8jXAWf6hTImOKhinAAUT'
    && env.NEXT_PUBLIC_SUPABASE_URL === 'https://ifptyzikekrswippzmsf.supabase.co'
    && env.HB_HOMOLOGATION_ONLY !== 'true' && env.VERCEL_ENV === 'production';
  return !homolog && !official;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const ignored = ignoreRelease835Build(process.env);
  console.log(ignored ? 'Build bloqueado: projeto, banco, ambiente ou branch incorretos.' : 'Destino do build conferido.');
  process.exit(ignored ? 0 : 1);
}
