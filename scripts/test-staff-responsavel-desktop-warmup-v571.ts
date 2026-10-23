/**
 * PC gestão — warmup 2min sem sync/reconciliar pesado automático.
 * npx tsx scripts/test-staff-responsavel-desktop-warmup-v571.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const store = readFileSync(join(ROOT, "src/services/dataStore.ts"), "utf8");
const sync = readFileSync(join(ROOT, "src/components/sync/CooperativaSyncProvider.tsx"), "utf8");
const livro = readFileSync(join(ROOT, "src/hooks/useReconciliarLivroCaixaGestao.ts"), "utf8");

assert.match(store, /staffGestaoSkipAutoPersistMergeOnDesktop/);
assert.match(sync, /staffGestaoDesktopWarmupSyncPaused/);
assert.match(livro, /staffGestaoDesktopWarmupSyncPaused/);
assert.doesNotMatch(livro, /tentar\(\);\s*\n\s*agendar\(\)/);

console.log("OK test-staff-responsavel-desktop-warmup-v571");
