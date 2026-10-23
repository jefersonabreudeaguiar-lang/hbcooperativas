/**
 * Contrato do responsável — não retroceder o que já estava certo:
 * v438 Contratos/Pagar last-good, v461 faixa Chrome, v463/v475 PIX sai do Em aberto,
 * v474 só dataEntrega, v476 alinhar antes do lastro, v477 clique sempre navega.
 * Uso: npx tsx scripts/test-conferir-producao-ui-v461.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion.ts";

assert.ok(APP_BUILD_VERSION >= 478, "build depois do PIX pago não sumir do caixa");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const release = read("src/lib/pwa/clientRelease.ts");
assert.match(
  /function shouldAutoAlignClientRelease[\s\S]{0,280}display-mode: standalone/.test(release)
    ? "ok"
    : "",
  /^ok$/,
  "Chrome do responsável não dá hard-reload sozinho (só PWA) — v461"
);
const chunkGuard = read("src/lib/pwa/chunkDplAlignGuard.ts");
assert.match(chunkGuard, /if\(!standalone\(\)\)return/, "chunk dpl não manda o browser para pwa-launch");

const staffApp = read("src/app/(app)/notas-pedido/staff/NotasPedidoStaffResponsavelApp.tsx");
assert.doesNotMatch(staffApp, /StaffConferirProducaoBar/, "faixa Ao vivo produção saiu do Conferir");
const staffPainelRefresh = read("src/lib/staff/staffGestaoPainelRefresh.ts");
assert.match(
  staffPainelRefresh,
  /export function refreshStaffGestaoPainelLeitura[\s\S]{0,120}resetResponsavelPainelIndexCache\(\)/,
  "pull operacional zera cache do painel (Em aberto / Conferir) — v461+"
);
assert.match(
  staffPainelRefresh,
  /staffGestaoPainelAposPullOperacional[\s\S]{0,200}refreshStaffGestaoPainelLeitura/,
  "após operacional, painel recalcula sem latch fantasma"
);

const staffUpgrade = read("src/lib/pwa/fetchOfficialClientRelease.ts");
assert.match(staffUpgrade, /export async function requestManualStaffReleaseUpgrade/, "upgrade dedicado do responsável");
assert.match(staffUpgrade, /replaceWithPublishedRelease/, "se align bloquear, replace com hb-pwa");
assert.match(staffUpgrade, /manual_staff/, "reason do clique do Conferir");

const atualizar = read("src/components/sync/SyncStatusChip.tsx");
assert.match(
  atualizar,
  /requestManualCooperadoReleaseUpgrade/,
  "Atualizar do chip também puxa o JS novo"
);

const contratos = read("src/app/(app)/contratos/page.tsx");
assert.match(contratos, /AbaLastGoodSafeRoot aba="contratos"/, "Contratos não retrocedem — v438");
const pagar = read("src/app/(app)/ficha-corrida/FichaCorridaContent.tsx");
assert.match(pagar, /AbaLastGoodSafeRoot aba="pagar"/, "Pagar não retrocede — v438");

const painel = read("src/services/responsavelPainelIndex.ts");
assert.match(
  painel,
  /const alinhado = alinharFichaComPagamentosCooperativa\(comCadastro\)/,
  "PIX alinha ficha antes do lastro — v476"
);
assert.match(
  painel,
  /const out = aplicarLastroCompletenessConferir\(alinhado/,
  "lastro Conferir só depois do alinhamento PIX"
);
assert.match(painel, /if \(!old \|\| f\.status === "pago" \|\| old\.status !== "pago"\)/, "pago ganha no merge do lastro");
assert.match(painel, /function mesPagoDeveSairDoEmAberto/, "mês com PIX sai do Em aberto — v475");
assert.match(painel, /linhaEmAbertoSemValoresPagos/, "lastro não devolve valor já pago — v463/v475");

const nota = read("src/services/notaPedidoService.ts");
const temporal = nota.match(
  /function notaReferenciaTemporalEscopoPagamento[\s\S]{0,420}?^}/m
);
assert.ok(temporal, "âncora temporal do PIX existe");
assert.match(temporal[0], /dataEntrega/, "escopo do PIX usa dataEntrega — v474");
assert.doesNotMatch(temporal[0], /createdAt/, "createdAt não reabre mês pago — v474");

const caixaGuard = read("src/services/livroCaixaPagamentoGuard.ts");
assert.match(caixaGuard, /preservarLivroCaixaDePagamentosConfirmados/, "PIX confirmado mantém o caixa");
const upload = read("src/lib/supabase/cooperativaSyncStorage.ts");
assert.match(
  upload,
  /aplicarPreservacaoLivroCaixaPagamentosConfirmadosNoOperacional/,
  "upload operacional não apaga o caixa do PIX"
);

const sw = read("public/sw.js");
assert.match(sw, new RegExp(`hb-coop-build-${APP_BUILD_VERSION}`), "SW no mesmo build");

console.log(`ok: responsável v${APP_BUILD_VERSION} — v438/v461/v463/v474/v476 travados, clique sempre navega`);
