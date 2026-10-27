import type { NextConfig } from "next";
import { X_ROBOTS_TAG_NOINDEX, isSearchIndexingAllowed } from "./src/lib/security/crawlerPolicy";
import { validateProductionClientEnv } from "./src/lib/security/validateProductionClientEnv";
import { resolveV2HbOnlyPublicEnv } from "./src/lib/product/v2HbOnly";

const prodEnvIssues = validateProductionClientEnv();
if (prodEnvIssues.length > 0) {
  console.warn("[hb-coop] Avisos de ambiente em produção:\n", prodEnvIssues.join("\n"));
}

const CSP_DIRECTIVES = [
  "object-src 'none'",
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vitals.vercel-insights.com https://*.vercel-scripts.com",
  "worker-src 'self'",
  "frame-src 'self' https://*.supabase.co blob:",
  "media-src 'self' blob: data: https:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

/** Bootstrap PWA (HTML estático em /public) — sem upgrade-insecure-requests para evitar edge cases no WebView. */
const PWA_BOOTSTRAP_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
  CSP_DIRECTIVES.push("upgrade-insecure-requests");
}

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: CSP_DIRECTIVES.join("; "),
  },
];

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_HB_CREDIT_ENABLED:
      process.env.NEXT_PUBLIC_HB_CREDIT_ENABLED ?? process.env.HB_CREDIT_ENABLED ?? "false",
    /** Garante inline no bundle cliente (Vercel vercel.json + dashboard). */
    NEXT_PUBLIC_HB_BIC_PRODUCTION_LOCK: process.env.NEXT_PUBLIC_HB_BIC_PRODUCTION_LOCK ?? "false",
    NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL:
      process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL ??
      (process.env.VERCEL_ENV === "production" ? "true" : "false"),
    NEXT_PUBLIC_BIC_CENTRAL_READ_FULL_OFFICIAL:
      process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_FULL_OFFICIAL ?? "false",
    NEXT_PUBLIC_BIC_CENTRAL_READ: process.env.NEXT_PUBLIC_BIC_CENTRAL_READ ?? "true",
    NEXT_PUBLIC_COOPERADO_FINANCEIRO_APPDATA_LIVE:
      process.env.NEXT_PUBLIC_COOPERADO_FINANCEIRO_APPDATA_LIVE ?? "false",
    NEXT_PUBLIC_STAFF_DEFER_APPDATA_EAGER:
      process.env.NEXT_PUBLIC_STAFF_DEFER_APPDATA_EAGER ?? "true",
    NEXT_PUBLIC_STAFF_NOTAS_POLL_BOOT_DELAY_MS:
      process.env.NEXT_PUBLIC_STAFF_NOTAS_POLL_BOOT_DELAY_MS ?? "800",
    NEXT_PUBLIC_CONTA_COOP_UI_PUBLIC: process.env.NEXT_PUBLIC_CONTA_COOP_UI_PUBLIC ?? "1",
    NEXT_PUBLIC_CONTA_COOP_VALOR_RECEBER_PUBLIC:
      process.env.NEXT_PUBLIC_CONTA_COOP_VALOR_RECEBER_PUBLIC ?? "1",
    NEXT_PUBLIC_V2_HB_ONLY: resolveV2HbOnlyPublicEnv(process.env.NEXT_PUBLIC_V2_HB_ONLY),
    NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID ?? "",
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? "",
  },
  // Permite abrir o dev server pelo celular (IP da rede, ex.: 192.168.1.7:3000)
  allowedDevOrigins: [
    "192.168.1.7:3000",
    "192.168.0.*:3000",
    "192.168.1.*:3000",
    "10.*.*.*:3000",
  ],
  poweredByHeader: false,
  headers: async () => {
    const pageHeaders = [...SECURITY_HEADERS];
    if (!isSearchIndexingAllowed()) {
      pageHeaders.push({ key: "X-Robots-Tag", value: X_ROBOTS_TAG_NOINDEX });
    }
    return [
      {
        source: "/:path*",
        headers: pageHeaders,
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
      {
        source: "/pwa-:file(boot|launch|rescue|diag).html",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: PWA_BOOTSTRAP_CSP },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/manifest+json; charset=utf-8" },
        ],
      },
      // Vercel envia `public, max-age=31536000, immutable` ao browser em /_next/static;
      // next.config não substitui isso. Escopo entre publicações: query `?dpl=` + boot/SW/rescue.
      {
        source: "/_next/static/:path*",
        headers: [{ key: "CDN-Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
