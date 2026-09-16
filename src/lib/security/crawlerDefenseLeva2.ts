import type { NextRequest } from "next/server";
import { AI_AND_SCRAPER_USER_AGENTS, isSearchIndexingAllowed } from "@/lib/security/crawlerPolicy";
import { isPublicApiRoute } from "@/lib/security/publicApiPaths";
import { extractSessionTokenFromCookie } from "@/lib/security/sessionCookie";

/**
 * Leva 2 — rate limit / bloqueio opcional de bots de IA (fail-open para usuários reais).
 * Ativo em produção quando Leva 1 (noindex) está ativa, salvo HB_CRAWLER_DEFENSE_LEVA2=1|0.
 * HB_CRAWLER_AI_RATE_LIMIT=0 desliga rate limit; HB_CRAWLER_BLOCK_AI_PAGES=0 desliga 403 em páginas app.
 * Sessão hb_session ou Authorization Bearer nunca passam por bloqueio/rate limit.
 * Rollback total: HB_CRAWLER_DEFENSE_LEVA2=0 na Vercel.
 */
export function isCrawlerDefenseLeva2Enabled(): boolean {
  if (process.env.HB_CRAWLER_DEFENSE_LEVA2 === "0") return false;
  if (process.env.HB_CRAWLER_DEFENSE_LEVA2 === "1") return true;
  if (isSearchIndexingAllowed()) return false;
  return process.env.NODE_ENV === "production";
}

export function isAiOrMassScraperUserAgent(userAgent: string | null): boolean {
  const ua = (userAgent ?? "").trim();
  if (!ua) return false;
  const lower = ua.toLowerCase();
  return AI_AND_SCRAPER_USER_AGENTS.some((bot) => lower.includes(bot.toLowerCase()));
}

/** Sessão ou Bearer — nunca aplicar defesa Leva 2 (cooperado, sync, HB). */
export function hasAuthenticatedSessionHint(request: NextRequest): boolean {
  if (extractSessionTokenFromCookie(request)) return true;
  const auth = request.headers.get("authorization")?.trim();
  return Boolean(auth?.startsWith("Bearer ") && auth.length > 10);
}

const PAGE_ALLOWLIST_PREFIXES = [
  "/login",
  "/cadastro",
  "/baixar-app",
  "/esqueci-senha",
  "/redefinir-senha",
  "/recuperar-senha",
  "/reset-senha",
] as const;

export function isLeva2PageAllowlisted(pathname: string): boolean {
  if (pathname === "/") return true;
  return PAGE_ALLOWLIST_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isStaticOrFrameworkPath(pathname: string): boolean {
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/favicon.ico" || pathname === "/robots.txt" || pathname === "/sitemap.xml") return true;
  return /\.(svg|png|jpg|jpeg|gif|webp|ico|woff2?|txt|xml|webmanifest)$/i.test(pathname);
}

export function shouldBlockAiDocumentRequest(pathname: string): boolean {
  if (process.env.HB_CRAWLER_BLOCK_AI_PAGES === "0") return false;
  if (pathname.startsWith("/api/")) return false;
  if (isStaticOrFrameworkPath(pathname)) return false;
  if (isLeva2PageAllowlisted(pathname)) return false;
  return true;
}

function rateLimitMaxPerMinute(): number {
  const raw = Number(process.env.HB_CRAWLER_AI_RATE_LIMIT_PER_MIN ?? "45");
  if (!Number.isFinite(raw) || raw < 2) return 45;
  return Math.min(500, Math.floor(raw));
}

type Bucket = { count: number; resetAt: number };
const aiPublicApiBuckets = new Map<string, Bucket>();

/** true = permitido; false = excedeu limite */
export function checkAiPublicApiRateLimit(request: NextRequest, pathname: string, method: string): boolean {
  if (process.env.HB_CRAWLER_AI_RATE_LIMIT === "0") return true;
  if (!isPublicApiRoute(pathname, method)) return true;
  const m = method.toUpperCase();
  if (m !== "GET" && m !== "HEAD") return true;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown";
  const ua = (request.headers.get("user-agent") ?? "na").slice(0, 80);
  const key = `${ip}|${ua}|${pathname}`;
  const now = Date.now();
  const windowMs = 60_000;
  const max = rateLimitMaxPerMinute();

  let bucket = aiPublicApiBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    aiPublicApiBuckets.set(key, bucket);
  }
  bucket.count += 1;
  if (aiPublicApiBuckets.size > 5000) {
    aiPublicApiBuckets.clear();
  }
  return bucket.count <= max;
}

/** Apenas testes — zera contadores in-memory do edge isolate. */
export function resetAiPublicApiRateLimitForTests(): void {
  aiPublicApiBuckets.clear();
}

export type Leva2DefenseResult =
  | { action: "allow" }
  | { action: "block_pages"; status: 403; message: string }
  | { action: "rate_limit"; status: 429; message: string };

export function evaluateLeva2Defense(request: NextRequest, pathname: string): Leva2DefenseResult {
  if (!isCrawlerDefenseLeva2Enabled()) return { action: "allow" };
  if (hasAuthenticatedSessionHint(request)) return { action: "allow" };

  const ua = request.headers.get("user-agent");
  if (!isAiOrMassScraperUserAgent(ua)) return { action: "allow" };

  if (pathname.startsWith("/api/")) {
    if (!checkAiPublicApiRateLimit(request, pathname, request.method)) {
      return {
        action: "rate_limit",
        status: 429,
        message: "Muitas requisições automatizadas. Use o aplicativo com login autorizado.",
      };
    }
    return { action: "allow" };
  }

  if (shouldBlockAiDocumentRequest(pathname)) {
    return {
      action: "block_pages",
      status: 403,
      message:
        "Acesso automatizado a esta área não é permitido. Cooperados e responsáveis devem usar login no aplicativo.",
    };
  }

  return { action: "allow" };
}
