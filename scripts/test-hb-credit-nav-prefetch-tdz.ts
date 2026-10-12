/**
 * Regressão TDZ — HbCreditNavPrefetch (cooperado + requestIdleCallback).
 * Bug: `cancelled` era declarado após `return` do ramo cooperado → TDZ no idle callback.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const path = resolve(process.cwd(), "src/hooks/useHbCreditNavPrefetch.ts");
const src = readFileSync(path, "utf8");

const effectMatch = src.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[/);
assert.ok(effectMatch, "useEffect body not found");
const body = effectMatch[1];

const cooperadoIdx = body.indexOf('user.role === "cooperado"');
assert.ok(cooperadoIdx >= 0, "cooperado branch missing");

const cancelledDecl = body.indexOf("let cancelled = false");
assert.ok(cancelledDecl >= 0, "let cancelled missing");
assert.ok(
  cancelledDecl < cooperadoIdx,
  "let cancelled must be declared before cooperado branch (TDZ fix)"
);

console.log("test-hb-credit-nav-prefetch-tdz: ok");
