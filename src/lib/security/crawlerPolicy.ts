import type { Metadata } from "next";
import type { MetadataRoute } from "next";

/**
 * Leva 1 — anti-indexação (sem impacto em login, sync, HB ou APIs autenticadas).
 * Rollback: HB_ALLOW_SEARCH_INDEXING=1 no ambiente Vercel.
 */
export function isSearchIndexingAllowed(): boolean {
  return process.env.HB_ALLOW_SEARCH_INDEXING === "1";
}

/** Cabeçalho HTTP reforçado (robots.txt pode ser ignorado por bots maliciosos). */
export const X_ROBOTS_TAG_NOINDEX = "noindex, nofollow, noarchive, nosnippet";

/** Metadados HTML — cooperado, mercado, responsável (app autenticado). */
export function getPrivateAppRobotsMetadata(): Metadata["robots"] {
  if (isSearchIndexingAllowed()) {
    return { index: true, follow: true };
  }
  return {
    index: false,
    follow: false,
    nocache: true,
    noarchive: true,
    nosnippet: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      noarchive: true,
      nosnippet: true,
    },
  };
}

/** User-Agents de crawlers de IA / scraping massivo — regra explícita em robots.txt. */
export const AI_AND_SCRAPER_USER_AGENTS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "anthropic-ai",
  "Claude-Web",
  "Google-Extended",
  "Bytespider",
  "CCBot",
  "PerplexityBot",
  "Amazonbot",
  "FacebookBot",
  "meta-externalagent",
  "Applebot-Extended",
  "cohere-ai",
  "Diffbot",
  "ImagesiftBot",
  "YouBot",
] as const;

export function buildRobotsManifest(): MetadataRoute.Robots {
  if (isSearchIndexingAllowed()) {
    return {
      rules: { userAgent: "*", allow: "/" },
    };
  }

  const rules: MetadataRoute.Robots["rules"] = [
    { userAgent: "*", disallow: ["/"] },
    ...AI_AND_SCRAPER_USER_AGENTS.map((userAgent) => ({
      userAgent,
      disallow: ["/"] as string[],
    })),
  ];

  return { rules };
}

export function buildEmptySitemap(): MetadataRoute.Sitemap {
  if (isSearchIndexingAllowed()) {
    return [];
  }
  return [];
}
