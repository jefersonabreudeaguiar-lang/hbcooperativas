import assert from "node:assert/strict";
import {
  BLOCKED_VERCEL_DEPLOYMENT_IDS,
  evaluateClientReleaseAlignment,
  shouldAllowHardReload,
} from "../src/lib/pwa/clientRelease";
import { cooperadoRuntimeAlreadyOnCanonicalRelease } from "../src/lib/pwa/fetchOfficialClientRelease";

const CANONICAL = {
  build: 95,
  deploymentId: "dpl_7MX5cFF9VD1mryPm3bK1em6kXxCs",
  gitCommitSha: "0cea0c1",
};

{
  const d = evaluateClientReleaseAlignment({
    canonical: CANONICAL,
    pageRelease: CANONICAL,
    loadedDeploymentIds: ["dpl_Eoe9gz7YBsqYNhY1LMM79ofEDrKZ"],
  });
  assert.equal(d.action, "align");
  assert.match(d.reason, /blocked/);
}

{
  const d = evaluateClientReleaseAlignment({
    canonical: CANONICAL,
    pageRelease: CANONICAL,
    loadedDeploymentIds: [],
  });
  assert.equal(d.action, "pending");
}

{
  const d = evaluateClientReleaseAlignment({
    canonical: CANONICAL,
    pageRelease: { ...CANONICAL, deploymentId: "dpl_html_antigo" },
    loadedDeploymentIds: [CANONICAL.deploymentId],
  });
  assert.equal(d.action, "align");
  assert.match(d.reason, /page_dpl/);
}

{
  const d = evaluateClientReleaseAlignment({
    canonical: CANONICAL,
    pageRelease: CANONICAL,
    loadedDeploymentIds: [CANONICAL.deploymentId],
  });
  assert.equal(d.action, "ok");
}

assert.ok(BLOCKED_VERCEL_DEPLOYMENT_IDS.includes("dpl_Eoe9gz7YBsqYNhY1LMM79ofEDrKZ"));
assert.equal(typeof shouldAllowHardReload("test"), "boolean");

{
  const canon = { build: 102, deploymentId: "dpl_new", gitCommitSha: "abc" };
  const embedded = { build: 101, deploymentId: "dpl_old", gitCommitSha: "" };
  assert.equal(
    cooperadoRuntimeAlreadyOnCanonicalRelease(canon, { build: 102, deploymentId: "dpl_new", gitCommitSha: "" }, embedded),
    true
  );
  assert.equal(
    cooperadoRuntimeAlreadyOnCanonicalRelease(canon, { build: 101, deploymentId: "dpl_old", gitCommitSha: "" }, embedded),
    false
  );
}

console.log("test-client-release-guard: ok");
