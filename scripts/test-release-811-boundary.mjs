import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ignoreRelease811Build } from './ignore-unsafe-release-811.mjs';
const hom = { VERCEL_GIT_COMMIT_REF: 'codex/hb-cashbook-integrity-811', VERCEL_PROJECT_ID: 'prj_1dqke8xRjtzsCouFEczEB4ZgmF10', NEXT_PUBLIC_SUPABASE_URL: 'https://ocyfzramxvxqbtkorubn.supabase.co', HB_HOMOLOGATION_ONLY: 'true', VERCEL_ENV: 'preview' };
const prod = { ...hom, VERCEL_PROJECT_ID: 'prj_LZM7D77Y8jXAWf6hTImOKhinAAUT', NEXT_PUBLIC_SUPABASE_URL: 'https://ifptyzikekrswippzmsf.supabase.co', HB_HOMOLOGATION_ONLY: 'false', VERCEL_ENV: 'production' };
for (const valid of [hom, prod]) {
  assert.equal(ignoreRelease811Build(valid), false);
  for (const key of ['VERCEL_GIT_COMMIT_REF', 'VERCEL_PROJECT_ID', 'NEXT_PUBLIC_SUPABASE_URL', 'VERCEL_ENV']) {
    assert.equal(ignoreRelease811Build({ ...valid, [key]: 'wrong' }), true, key);
  }
}
assert.equal(ignoreRelease811Build({ ...hom, HB_HOMOLOGATION_ONLY: 'false' }), true);
assert.equal(ignoreRelease811Build({ ...prod, HB_HOMOLOGATION_ONLY: 'true' }), true);
const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
assert.equal(config.env.NEXT_PUBLIC_COOPERADO_TRANSFERENCIA_CREDITO, 'false');
assert.equal(config.env.HB_OPERACIONAL_VERSIONED_SYNC, undefined);
assert.equal(config.env.HB_OWNED_BALANCE_OPERATIONS_ENABLED, undefined);
assert.match(fs.readFileSync('src/lib/appBuildVersion.ts', 'utf8'), /APP_BUILD_VERSION = 811/);
assert.match(fs.readFileSync('public/sw.js', 'utf8'), /hb-coop-build-811-/);
console.log('PASS: candidata isolada nos destinos corretos, sem ativar CAS ou novas operações financeiras.');







