import assert from "node:assert/strict";
import { ignoreSecurityPreview } from "./ignore-unsafe-security-preview.mjs";
const safe = {
  VERCEL_GIT_COMMIT_REF: "codex/seguranca-etapa-1",
  VERCEL_PROJECT_ID: "prj_1dqke8xRjtzsCouFEczEB4ZgmF10",
  NEXT_PUBLIC_SUPABASE_URL: "https://ocyfzramxvxqbtkorubn.supabase.co",
  HB_HOMOLOGATION_ONLY: "true",
};
assert.equal(ignoreSecurityPreview(safe), false);
assert.equal(ignoreSecurityPreview({ ...safe, VERCEL_PROJECT_ID: "production-project" }), true);
assert.equal(ignoreSecurityPreview({ ...safe, NEXT_PUBLIC_SUPABASE_URL: "https://production.invalid" }), true);
assert.equal(ignoreSecurityPreview({ ...safe, HB_HOMOLOGATION_ONLY: undefined }), true);
assert.equal(ignoreSecurityPreview({ VERCEL_GIT_COMMIT_REF: "codex/seguranca-etapa-1" }), true);
assert.equal(ignoreSecurityPreview({ VERCEL_GIT_COMMIT_REF: "codex/restore-v1-login" }), false);
console.log("PASS: candidato somente no projeto/banco isolados; configuração ausente bloqueia; linha estável permanece independente.");
