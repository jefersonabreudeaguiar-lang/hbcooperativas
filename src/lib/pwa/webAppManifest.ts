import { getAppBaseUrl } from "@/lib/security/appUrl";
import {
  homologLabDisplayName,
  homologLabShortName,
  isHomologAppDeployment,
} from "@/lib/security/homologDeployment";

export type WebAppManifestJson = {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: string;
  display_override: string[];
  orientation: string;
  background_color: string;
  theme_color: string;
  lang: string;
  categories: string[];
  icons: Array<{ src: string; sizes: string; type: string; purpose: string }>;
  shortcuts: Array<{
    name: string;
    short_name: string;
    url: string;
    icons: Array<{ src: string; sizes: string; type: string }>;
  }>;
  share_target: {
    action: string;
    method: string;
    enctype: string;
    params: Record<string, unknown>;
  };
};

function originFromRequest(request?: Request): string {
  if (request) {
    try {
      return getAppBaseUrl(request);
    } catch {
      /* fall through */
    }
  }
  const fallback = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  if (fallback) return getAppBaseUrl();
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`.replace(/\/$/, "");
  return "https://hbcooperativas.vercel.app";
}

/** Manifest com URLs absolutas — WebAPK Android exige escopo/start_url coerentes com a origem servida. */
export function buildWebAppManifest(request?: Request): WebAppManifestJson {
  const origin = originFromRequest(request).replace(/\/$/, "");
  const icon192 = `${origin}/icons/icon-192.png`;
  const launch = (nextPath: string) =>
    `${origin}/pwa-launch.html?next=${encodeURIComponent(nextPath)}`;

  const homolog = isHomologAppDeployment();
  return {
    id: homolog ? `${origin}/?hb-env=homolog` : `${origin}/`,
    name: homolog ? homologLabDisplayName() : "HB Cooperativas",
    short_name: homolog ? homologLabShortName() : "HB Coop",
    description: homolog
      ? "Espelho de testes — responsável e cooperado (dados homolog, separado do app oficial)"
      : "Gestão de cooperativas — entregas, mensalidades e ficha corrida",
    start_url: `${origin}/pwa-launch.html`,
    scope: `${origin}/`,
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: "#15803d",
    lang: "pt-BR",
    categories: ["business", "productivity"],
    icons: [
      { src: `${origin}/icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${origin}/icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: `${origin}/icons/icon-512-maskable.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Início",
        short_name: "Início",
        url: launch("/login?next=/dashboard"),
        icons: [{ src: icon192, sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Entregas",
        short_name: "Entregas",
        url: launch("/login?next=/notas-pedido"),
        icons: [{ src: icon192, sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Financeiro",
        short_name: "Financeiro",
        url: launch("/login?next=/ficha-corrida"),
        icons: [{ src: icon192, sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Preços",
        short_name: "Preços",
        url: launch("/login?next=/precos"),
        icons: [{ src: icon192, sizes: "192x192", type: "image/png" }],
      },
    ],
    share_target: {
      action: `${origin}/share/mensalidade`,
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [
          { name: "media", accept: ["image/*", "application/pdf"] },
          { name: "files", accept: ["image/*", "application/pdf"] },
        ],
      },
    },
  };
}
