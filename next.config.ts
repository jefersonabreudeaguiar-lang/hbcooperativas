import type { NextConfig } from "next";

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
    value: [
      "object-src 'none'",
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "media-src 'self' blob: data:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_HB_CREDIT_ENABLED:
      process.env.NEXT_PUBLIC_HB_CREDIT_ENABLED ?? process.env.HB_CREDIT_ENABLED ?? "false",
  },
  // Permite abrir o dev server pelo celular (IP da rede, ex.: 192.168.1.7:3000)
  allowedDevOrigins: [
    "192.168.1.7:3000",
    "192.168.0.*:3000",
    "192.168.1.*:3000",
    "10.*.*.*:3000",
  ],
  poweredByHeader: false,
  headers: async () => [
    {
      source: "/:path*",
      headers: SECURITY_HEADERS,
    },
    {
      source: "/api/:path*",
      headers: [
        { key: "Cache-Control", value: "no-store" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
    },
  ],
};

export default nextConfig;
