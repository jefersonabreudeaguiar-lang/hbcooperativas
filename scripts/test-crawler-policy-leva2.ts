/**
 * Leva 2 — defesa contra bots de IA (fail-open para sessão real).
 * Uso: npm run test:crawler-leva2
 */
import assert from "node:assert/strict";

async function main() {
  const prevLeva2 = process.env.HB_CRAWLER_DEFENSE_LEVA2;
  const prevIndex = process.env.HB_ALLOW_SEARCH_INDEXING;
  const prevNodeEnv = process.env.NODE_ENV;
  const prevRate = process.env.HB_CRAWLER_AI_RATE_LIMIT_PER_MIN;

  process.env.HB_CRAWLER_DEFENSE_LEVA2 = "1";
  process.env.HB_ALLOW_SEARCH_INDEXING = "0";
  process.env.NODE_ENV = "production";

  const {
    checkAiPublicApiRateLimit,
    evaluateLeva2Defense,
    isAiOrMassScraperUserAgent,
    isCrawlerDefenseLeva2Enabled,
    isLeva2PageAllowlisted,
    resetAiPublicApiRateLimitForTests,
  } = await import("../src/lib/security/crawlerDefenseLeva2.ts");
  const { isPublicApiRoute } = await import("../src/lib/security/publicApiPaths.ts");

  assert.equal(isPublicApiRoute("/api/credit/status", "GET"), true);

  assert.equal(isCrawlerDefenseLeva2Enabled(), true);
  assert.equal(isAiOrMassScraperUserAgent("Mozilla/5.0 GPTBot/1.0"), true);
  assert.equal(isAiOrMassScraperUserAgent("Mozilla/5.0 Chrome/120"), false);
  assert.equal(isLeva2PageAllowlisted("/login"), true);
  assert.equal(isLeva2PageAllowlisted("/dashboard"), false);

  function mockRequest(opts: {
    pathname?: string;
    ua?: string;
    cookie?: string;
    method?: string;
  }): import("next/server").NextRequest {
    const headers = new Headers();
    if (opts.ua) headers.set("user-agent", opts.ua);
    if (opts.cookie) headers.set("cookie", opts.cookie);
    return {
      headers,
      method: opts.method ?? "GET",
      nextUrl: { pathname: opts.pathname ?? "/dashboard" },
    } as import("next/server").NextRequest;
  }

  assert.equal(evaluateLeva2Defense(mockRequest({ ua: "Chrome", pathname: "/ficha-corrida" }), "/ficha-corrida").action, "allow");
  assert.equal(
    evaluateLeva2Defense(
      mockRequest({ ua: "GPTBot", pathname: "/dashboard", cookie: "hb_session=t" }),
      "/dashboard"
    ).action,
    "allow"
  );
  assert.equal(evaluateLeva2Defense(mockRequest({ ua: "GPTBot", pathname: "/dashboard" }), "/dashboard").action, "block_pages");
  assert.equal(evaluateLeva2Defense(mockRequest({ ua: "GPTBot", pathname: "/login" }), "/login").action, "allow");

  process.env.HB_CRAWLER_AI_RATE_LIMIT_PER_MIN = "2";
  resetAiPublicApiRateLimitForTests();
  let ok = 0;
  for (let i = 0; i < 3; i++) {
    if (
      checkAiPublicApiRateLimit(
        mockRequest({ ua: "GPTBot", pathname: "/api/credit/status", method: "GET" }),
        "/api/credit/status",
        "GET"
      )
    ) {
      ok += 1;
    }
  }
  assert.equal(ok, 2, "rate limit public GET for AI UA");

  process.env.HB_CRAWLER_DEFENSE_LEVA2 = "0";
  assert.equal(isCrawlerDefenseLeva2Enabled(), false);

  if (prevLeva2 === undefined) delete process.env.HB_CRAWLER_DEFENSE_LEVA2;
  else process.env.HB_CRAWLER_DEFENSE_LEVA2 = prevLeva2;
  if (prevIndex === undefined) delete process.env.HB_ALLOW_SEARCH_INDEXING;
  else process.env.HB_ALLOW_SEARCH_INDEXING = prevIndex;
  if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = prevNodeEnv;
  if (prevRate === undefined) delete process.env.HB_CRAWLER_AI_RATE_LIMIT_PER_MIN;
  else process.env.HB_CRAWLER_AI_RATE_LIMIT_PER_MIN = prevRate;

  console.log("OK — crawler defense leva 2");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
