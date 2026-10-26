/**
 * PC gestão — um único prefetch leve; mobile mantém aquecimento agressivo.
 * npx tsx scripts/test-staff-desktop-prefetch-policy.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const prefetch = read("src/lib/performance/staffNavPrefetch.ts");
assert.ok(prefetch.includes("scheduleStaffNavPrefetchDesktop"), "desktop scheduler");
assert.ok(prefetch.includes("isStaffMobileViewportActive"), "mobile guard no prefetch agressivo");

const bootstrap = read("src/components/performance/CooperadoMobilePerfBootstrap.tsx");
assert.ok(bootstrap.includes("isStaffMobileViewportActive"), "bootstrap staff só no mobile");

const layout = read("src/components/layout/AppLayout.tsx");
assert.ok(layout.includes("scheduleStaffNavPrefetchDesktop"), "AppShell desktop leve");
assert.ok(layout.includes("max-width: 1023px"), "MobileNav prefetch só no mobile");

console.log("OK test-staff-desktop-prefetch-policy");
