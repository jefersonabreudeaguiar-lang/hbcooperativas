import assert from "node:assert/strict";
import { ignoreOfficialV1Build } from "./ignore-unsafe-official-v1.mjs";
const valid={VERCEL_PROJECT_ID:"prj_LZM7D77Y8jXAWf6hTImOKhinAAUT",NEXT_PUBLIC_SUPABASE_URL:"https://ifptyzikekrswippzmsf.supabase.co"};
assert.equal(ignoreOfficialV1Build(valid),false);
assert.equal(ignoreOfficialV1Build({...valid,VERCEL_PROJECT_ID:"prj_1dqke8xRjtzsCouFEczEB4ZgmF10"}),true);
assert.equal(ignoreOfficialV1Build({...valid,NEXT_PUBLIC_SUPABASE_URL:"https://ocyfzramxvxqbtkorubn.supabase.co"}),true);
assert.equal(ignoreOfficialV1Build({...valid,HB_HOMOLOGATION_ONLY:"true"}),true);
assert.equal(ignoreOfficialV1Build({}),true);
console.log("PASS: publicação V1 limitada ao projeto/banco oficiais; homologação e ambiente incompleto recusados.");
