/**
 * Forensics de produção — detecta HTML/JS de deploys diferentes (causa típica de
 * "Cannot access 't' before initialization" no /dashboard).
 *
 * Uso: npx tsx scripts/pwa-crash-forensics-probe-once.ts
 *      npx tsx scripts/pwa-crash-forensics-probe-once.ts --url https://hbcooperativas.vercel.app
 */
import { fetchProductionRelease } from "./lib/productionReleaseProbe.ts";

const DEFAULT_BASE = "https://hbcooperativas.vercel.app";

function parseArgUrl(): string {
  const idx = process.argv.indexOf("--url");
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1].replace(/\/$/, "");
  return DEFAULT_BASE;
}

function extractMeta(html: string, attr: string): string {
  const re = new RegExp(`<html[^>]*\\s${attr}="([^"]*)"`, "i");
  const m = html.match(re);
  return m?.[1]?.trim() ?? "";
}

const DPL_RE = /^dpl_[A-Za-z0-9]{20,}$/;

function parseDplFromAssetUrl(url: string): string | null {
  const m = url.match(/[?&]dpl=([^&]+)/);
  if (!m?.[1]) return null;
  try {
    const id = decodeURIComponent(m[1]).trim();
    return DPL_RE.test(id) ? id : null;
  } catch {
    return null;
  }
}

function extractDeploymentIdsFromAssetTags(html: string): string[] {
  const seen = new Set<string>();
  const tagRe = /<(script|link)[^>]+(?:src|href)="([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const id = parseDplFromAssetUrl(m[2]);
    if (id) seen.add(id);
  }
  const pageDpl = extractMeta(html, "data-dpl-id");
  if (pageDpl && DPL_RE.test(pageDpl)) seen.add(pageDpl);
  return [...seen];
}

function extractScriptSamples(html: string, limit = 6): string[] {
  const out: string[] = [];
  const re = /<script[^>]+src="([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && out.length < limit) {
    const src = m[1];
    if (src.includes("_next/static")) out.push(src);
  }
  return out;
}

async function fetchHtml(path: string, base: string): Promise<{ status: number; html: string }> {
  const res = await fetch(`${base}${path}`, {
    redirect: "follow",
    headers: {
      "Cache-Control": "no-cache, no-store",
      Pragma: "no-cache",
      Accept: "text/html",
    },
  });
  const html = await res.text();
  return { status: res.status, html };
}

type RouteReport = {
  path: string;
  http: number;
  build: string;
  pageDpl: string;
  deploymentIds: string[];
  mixedDeploy: boolean;
  scriptSamples: string[];
};

async function probeRoute(base: string, path: string): Promise<RouteReport> {
  const { status, html } = await fetchHtml(path, base);
  const deploymentIds = extractDeploymentIdsFromAssetTags(html);
  const pageDpl = extractMeta(html, "data-dpl-id");
  const build = extractMeta(html, "data-app-build");
  const unique = new Set(deploymentIds);
  const mixedDeploy =
    unique.size > 1 ||
    (Boolean(pageDpl) && deploymentIds.some((id) => id !== pageDpl && id.length > 0));
  return {
    path,
    http: status,
    build,
    pageDpl,
    deploymentIds: [...unique],
    mixedDeploy,
    scriptSamples: extractScriptSamples(html),
  };
}

function verdict(reports: RouteReport[], cloudDpl: string, cloudBuild: number) {
  const findings: string[] = [];
  for (const r of reports) {
    if (r.mixedDeploy) {
      findings.push(
        `MIXED_DEPLOY ${r.path}: ${r.deploymentIds.length} deployment id(s) no HTML — ${r.deploymentIds.join(", ")}`
      );
    }
    const b = Number(r.build);
    if (b > 0 && cloudBuild > 0 && b < cloudBuild) {
      findings.push(`STALE_HTML ${r.path}: build HTML ${b} < nuvem ${cloudBuild}`);
    }
    if (r.pageDpl && cloudDpl && r.pageDpl !== cloudDpl) {
      findings.push(`DPL_DRIFT ${r.path}: HTML dpl ${r.pageDpl} ≠ client-release ${cloudDpl}`);
    }
  }
  if (findings.length === 0) {
    findings.push("OK: nenhum sinal de chunk misto no HTML servido agora (incidente pode ser cache do cliente).");
  }
  return findings;
}

async function main() {
  const base = parseArgUrl();
  console.log("HB PWA crash forensics — servidor");
  console.log("Base:", base);
  console.log("");

  const release = await fetchProductionRelease(base);
  if (!release.ok) {
    console.error("Falha client-release:", release.error);
    process.exit(1);
  }
  const cloud = release.data;
  console.log("client-release:", cloud);
  console.log("");

  const paths = ["/login", "/dashboard", "/pwa-launch.html"];
  const reports: RouteReport[] = [];
  for (const path of paths) {
    const r = await probeRoute(base, path);
    reports.push(r);
    console.log(`--- ${path} HTTP ${r.http} ---`);
    console.log("  build HTML:", r.build || "(ausente)");
    console.log("  dpl HTML:", r.pageDpl || "(ausente)");
    console.log("  dpl únicos no documento:", r.deploymentIds.join(", ") || "(nenhum)");
    console.log("  mixedDeploy:", r.mixedDeploy ? "SIM ⚠" : "não");
    if (r.scriptSamples[0]) console.log("  script[0]:", r.scriptSamples[0]);
    console.log("");
  }

  console.log("=== VEREDITO ===");
  for (const line of verdict(reports, cloud.deploymentId, cloud.build)) {
    console.log(" •", line);
  }
  console.log("");
  console.log(
    "Se MIXED_DEPLOY ou TDZ no celular: cooperado deve usar pwa-rescue ou botão Reparar atalho."
  );
  console.log("Relatório no dispositivo: /pwa-crash-forensics.html");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
