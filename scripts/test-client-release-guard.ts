import assert from "node:assert/strict";
import {
  BLOCKED_VERCEL_DEPLOYMENT_IDS,
  evaluateDeploymentGuard,
  shouldAllowHardReload,
} from "../src/lib/pwa/clientRelease";

const OFFICIAL = {
  build: 94,
  deploymentId: "dpl_7MX5cFF9VD1mryPm3bK1em6kXxCs",
  gitCommitSha: "0cea0c1",
};

{
  const d = evaluateDeploymentGuard({
    official: OFFICIAL,
    loadedDeploymentIds: ["dpl_Eoe9gz7YBsqYNhY1LMM79ofEDrKZ"],
  });
  assert.equal(d.action, "reload");
  assert.match(d.reason, /blocked_deployment/);
}

{
  const d = evaluateDeploymentGuard({
    official: OFFICIAL,
    loadedDeploymentIds: [],
  });
  assert.equal(d.action, "pending");
}

{
  const d = evaluateDeploymentGuard({
    official: OFFICIAL,
    loadedDeploymentIds: [OFFICIAL.deploymentId],
    htmlDeploymentId: "dpl_outro_antigo",
  });
  assert.equal(d.action, "ok");
}

{
  const d = evaluateDeploymentGuard({
    official: OFFICIAL,
    loadedDeploymentIds: ["dpl_Eoe9gz7YBsqYNhY1LMM79ofEDrKZ"],
    htmlDeploymentId: "dpl_Eoe9gz7YBsqYNhY1LMM79ofEDrKZ",
  });
  assert.equal(d.action, "reload");
}

{
  const d = evaluateDeploymentGuard({
    official: OFFICIAL,
    loadedDeploymentIds: [OFFICIAL.deploymentId],
  });
  assert.equal(d.action, "ok");
}

assert.ok(BLOCKED_VERCEL_DEPLOYMENT_IDS.includes("dpl_Eoe9gz7YBsqYNhY1LMM79ofEDrKZ"));
assert.equal(typeof shouldAllowHardReload("test"), "boolean");

console.log("test-client-release-guard: ok");
