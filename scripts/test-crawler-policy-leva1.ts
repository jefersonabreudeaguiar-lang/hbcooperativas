/**
 * Leva 1 anti-indexação — regressão (sem impacto em fluxos autenticados).
 * Uso: npm run test:crawler-leva1
 */
import assert from "node:assert/strict";
import {
  AI_AND_SCRAPER_USER_AGENTS,
  buildEmptySitemap,
  buildRobotsManifest,
  getPrivateAppRobotsMetadata,
  isSearchIndexingAllowed,
  X_ROBOTS_TAG_NOINDEX,
} from "../src/lib/security/crawlerPolicy.ts";

const prev = process.env.HB_ALLOW_SEARCH_INDEXING;
delete process.env.HB_ALLOW_SEARCH_INDEXING;

assert.equal(isSearchIndexingAllowed(), false);

const robots = getPrivateAppRobotsMetadata();
assert.equal(robots && typeof robots === "object" && "index" in robots && robots.index, false);

const manifest = buildRobotsManifest();
assert.ok(Array.isArray(manifest.rules));
const starRule = manifest.rules?.find((r) => typeof r === "object" && r && "userAgent" in r && r.userAgent === "*");
assert.ok(starRule && "disallow" in starRule && starRule.disallow?.includes("/"));

assert.ok(AI_AND_SCRAPER_USER_AGENTS.includes("GPTBot"));
assert.equal(buildEmptySitemap().length, 0);
assert.match(X_ROBOTS_TAG_NOINDEX, /noindex/);

process.env.HB_ALLOW_SEARCH_INDEXING = "1";
assert.equal(isSearchIndexingAllowed(), true);
assert.equal(buildEmptySitemap().length, 0);

if (prev === undefined) delete process.env.HB_ALLOW_SEARCH_INDEXING;
else process.env.HB_ALLOW_SEARCH_INDEXING = prev;

console.log("OK — crawler policy leva 1");
