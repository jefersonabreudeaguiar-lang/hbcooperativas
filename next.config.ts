import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
      source: "/api/:path*",
      headers: [
        { key: "Cache-Control", value: "no-store" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
    },
  ],
};

export default nextConfig;
