/**
 * H8.9.112 — sinal de entrada HB (aux + evento) somente na primeira conclusão de reload por montagem.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PAGE = join(process.cwd(), "src/app/(app)/minha-conta-coop/page.tsx");
const src = readFileSync(PAGE, "utf8");

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("PASS:", msg);
}

assert(src.includes("auxEntrySignaledRef"), "ref de sinalização única por montagem presente");

const reloadStart = src.indexOf("const reload = useCallback");
assert(reloadStart >= 0, "reload() useCallback encontrado");
const reloadEnd = src.indexOf("}, [cnpj, cooperadoId]);", reloadStart);
assert(reloadEnd > reloadStart, "fim do reload() encontrado");
const reloadBody = src.slice(reloadStart, reloadEnd + "}, [cnpj, cooperadoId]);".length);

assert(reloadBody.includes("fetchCreditAccount"), "primeiro reload continua aguardando fetchCreditAccount");
assert(!reloadBody.includes("fetchCreditLedger"), "ledger fora do reload (lazy)");

assert(
  /if \(!auxEntrySignaledRef\.current\)/.test(reloadBody),
  "guarda impede sinalização repetida no finally"
);
assert(
  reloadBody.includes("auxEntrySignaledRef.current = true") &&
    reloadBody.includes("setAuxSyncEnabled(true)") &&
    reloadBody.includes("notifyHbCreditAccountLoaded()"),
  "primeira conclusão (sucesso ou erro) libera aux + evento dentro da guarda"
);

const notifyCount = (reloadBody.match(/notifyHbCreditAccountLoaded\(\)/g) || []).length;
assert(notifyCount === 1, "notifyHbCreditAccountLoaded chamado uma única vez no reload");

assert(reloadBody.includes("} catch") && reloadBody.includes("} finally"), "erro no account ainda passa pelo finally");

console.log("\nH8.9.112 static checks OK");
