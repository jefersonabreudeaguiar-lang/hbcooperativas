#!/usr/bin/env npx tsx
/**
 * Auditoria completa — integração BIC no HB Coop (coopeagriplla-gestao).
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";
import { checkBicLabMirrorHealth } from "../../src/lib/lab/bicLabMirrorConfig";
import { isBicLabB4AuthorityEnabled } from "../../src/lib/lab/bicLabB4Authority";
import { isBicLabFullIntegrationEnabled } from "../../src/lib/lab/bicLabFullIntegration";
import { BIC_MIRROR_SYNC_PATHS } from "../../src/lib/lab/bicLabMirrorManifest";
import { loadBicLabEnv } from "./loadBicLabEnv";

const AUDIT_STEPS = [
  "test:bic-lab-boundary",
  "test:bic-tenant",
  "test:bic-facade-tenant",
  "test:bic-fallback-observability",
  "test:bic-shadow",
  "test:bic-b3.1-integration",
  "test:cooperado-financeiro",
  "test:h204-orlando-global",
  "test:bic-lab-b4-wiring",
  "test:bic-lab-full-wiring",
  "test:cooperado-inicio-card-policy",
];

const HUB_FILES: { area: string; path: string; pattern: RegExp; hub: string }[] = [
  {
    area: "dashboard início BIC",
    path: "src/app/(app)/dashboard/page.tsx",
    pattern: /bicCentralResolveInicioParaExibicao/,
    hub: "bicLeituraCentralCooperado",
  },
  {
    area: "dashboard card policy",
    path: "src/app/(app)/dashboard/page.tsx",
    pattern: /useCooperadoInicioValorReceberCardState/,
    hub: "cooperadoInicioCardPolicy",
  },
  { area: "ficha-corrida", path: "src/app/(app)/ficha-corrida/page.tsx", pattern: /bicLeituraCentralFicha/, hub: "bicLeituraCentralFicha" },
  {
    area: "notas-pedido",
    path: "src/app/(app)/notas-pedido/NotasPedidoContent.tsx",
    pattern: /bicLeituraCentralCooperado/,
    hub: "bicLeituraCentralCooperado",
  },
  {
    area: "minha-conta-coop",
    path: "src/app/(app)/minha-conta-coop/page.tsx",
    pattern: /bicLeituraCentralCooperado/,
    hub: "bicLeituraCentralCooperado",
  },
  { area: "relatórios", path: "src/app/(app)/relatorios/page.tsx", pattern: /bicLeituraCentralGestao/, hub: "bicLeituraCentralGestao" },
  {
    area: "fechamento-mensal",
    path: "src/app/(app)/fechamento-mensal/page.tsx",
    pattern: /bicLeituraCentralGestao/,
    hub: "bicLeituraCentralGestao",
  },
  { area: "financeiro", path: "src/app/(app)/financeiro/page.tsx", pattern: /bicLeituraCentralGestao/, hub: "bicLeituraCentralGestao" },
];

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = resolve(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(tsx|ts)$/.test(name)) acc.push(p);
  }
  return acc;
}

function grepLegacyInCooperadoUi(): string[] {
  const roots = [resolve("src/app/(app)"), resolve("src/components/cooperado")];
  const forbidden = [/\bgetValorQuantoVouReceber\b/, /\bgetInicioCooperadoParaExibicao\b/, /\bcooperadoExibirValorReceberInicio\b/];
  const hits: string[] = [];
  for (const root of roots) {
    for (const file of walk(root)) {
      const rel = relative(process.cwd(), file);
      if (rel.includes("lab/bic")) continue;
      const src = readFileSync(file, "utf8");
      for (const re of forbidden) {
        if (re.test(src) && !src.includes("bicLeituraCentral")) {
          hits.push(`${rel} → ${re.source}`);
        }
      }
    }
  }
  return hits;
}

async function main() {
  loadBicLabEnv();

  const stepResults: { step: string; ok: boolean }[] = [];
  for (const step of AUDIT_STEPS) {
    process.stdout.write(`--- npm run ${step} ---\n`);
    const r = spawnSync("npm", ["run", step], { stdio: "inherit", shell: true, env: process.env });
    stepResults.push({ step, ok: r.status === 0 });
  }

  const health = await checkBicLabMirrorHealth(process.env);
  const legacyHits = grepLegacyInCooperadoUi();
  const hubChecks = HUB_FILES.map(({ area, path, pattern, hub }) => {
    let ok = false;
    try {
      ok = pattern.test(readFileSync(resolve(path), "utf8"));
    } catch {
      ok = false;
    }
    return { area, hub, ok };
  });

  const b4 = isBicLabB4AuthorityEnabled();
  const full = isBicLabFullIntegrationEnabled();
  const allStepsOk = stepResults.every((s) => s.ok);
  const hubOk = hubChecks.every((h) => h.ok);
  const legacyOk = legacyHits.length === 0;
  const integracaoCodigoOk = allStepsOk && hubOk && legacyOk;
  const ambienteLabOk =
    b4 && full && health.gates.boundaryClear && health.issues.length === 0;
  const veredito = !integracaoCodigoOk
    ? "HB-COOP-BIC-AUDIT-RED"
    : ambienteLabOk
      ? "HB-COOP-BIC-AUDIT-GREEN"
      : "HB-COOP-BIC-INTEGRACAO-CODE-GREEN";

  const lines: string[] = [
    "# Auditoria — integração BIC HB Coop",
    "",
    `Gerado: ${new Date().toISOString()}`,
    "",
    `## Veredito: **${veredito}**`,
    "",
    "### Flags LAB",
    `- B4 authority: **${b4 ? "ON" : "OFF"}**`,
    `- LAB FULL: **${full ? "ON" : "OFF"}**`,
    `- Fase espelho /lab/bic: **${health.phase}**`,
    `- Integração código (testes + hub): **${integracaoCodigoOk ? "OK" : "FALHA"}**`,
    `- Ambiente LAB pronto (flags + fronteira): **${ambienteLabOk ? "OK" : "pendente"}**`,
    "",
    "### Política card início (endurecida)",
    "- Shell: sempre visível.",
    "- Valor: BIC + `cooperadoInicioCardPolicy` (revisão operacional).",
    "- Doc: `scripts/backups/COOPERADO-INICIO-CARD-POLITICA-ENDURECIDA.md`",
    "",
    "### Bateria automatizada",
    ...stepResults.map((s) => `- [${s.ok ? "x" : " "}] npm run ${s.step}`),
    "",
    "### Hub de leitura (UI)",
    ...hubChecks.map((h) => `- [${h.ok ? "x" : " "}] ${h.area} → \`${h.hub}\``),
    "",
    "### Espelho LAB",
    `- Paths espelho: **${BIC_MIRROR_SYNC_PATHS.length}**`,
    `- Issues: ${health.issues.length ? health.issues.join("; ") : "nenhuma"}`,
    "",
    "### Fora do BIC",
    "- Escrita operacional e produção oficial inalteradas.",
    "",
  ];

  if (legacyHits.length) {
    lines.push("### UI cooperado — motores legados diretos", ...legacyHits.map((h) => `- ${h}`), "");
  }

  if (!ambienteLabOk && integracaoCodigoOk) {
    lines.push(
      "### Ambiente LAB (não bloqueia integração de código)",
      ...(health.issues.length ? health.issues.map((i) => `- ${i}`) : ["- Ajuste `.env.local` conforme `.env.bic-lab.example` (B4 + FULL + Supabase homolog)."]),
      ""
    );
  }

  const outPath = resolve("scripts/backups/BIC-HB-COOP-INTEGRACAO-AUDITORIA.md");
  writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`\n=== Veredito: ${veredito} ===`);
  console.log(`Relatório: ${outPath}`);
  if (!integracaoCodigoOk) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
