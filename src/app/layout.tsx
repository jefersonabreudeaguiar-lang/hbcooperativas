import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/modules/auth/AuthProvider";
import { PwaProvider } from "@/components/pwa/PwaProvider";
import { PwaSilentServiceWorker } from "@/components/pwa/PwaSilentServiceWorker";
import { ClientReleaseShieldHost } from "@/components/pwa/ClientReleaseShieldHost";
import { getPrivateAppRobotsMetadata } from "@/lib/security/crawlerPolicy";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import {
  buildInlineDeploymentBootScript,
  buildInlinePageReleaseBootstrap,
  type ClientReleaseInfo,
} from "@/lib/pwa/clientRelease";
import { buildInlineRqlPerfStubScript } from "@/lib/performance/rqlPerfReport";
import { buildInlineCooperadoAppDataWarmScript } from "@/lib/performance/cooperadoAppDataInlineWarm";
import { RqlPerfDebugBootstrap } from "@/components/performance/RqlPerfDebugBootstrap";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const pageRelease: ClientReleaseInfo = {
  build: APP_BUILD_VERSION,
  deploymentId: (process.env.VERCEL_DEPLOYMENT_ID ?? "").trim(),
  gitCommitSha: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").trim(),
};

const cooperadoTabKeepAliveOn = !["false", "0", "no", "off"].includes(
  (process.env.NEXT_PUBLIC_COOPERADO_TAB_KEEP_ALIVE ?? "true").trim().toLowerCase()
);

const staffTabKeepAliveOn = !["false", "0", "no", "off"].includes(
  (process.env.NEXT_PUBLIC_STAFF_TAB_KEEP_ALIVE ?? "true").trim().toLowerCase()
);

export const metadata: Metadata = {
  title: "HB Cooperativas — Gestão de Cooperativas",
  description: "Plataforma HB Cooperativas — Portal do Cooperado e Painel Administrativo",
  manifest: "/manifest.webmanifest",
  applicationName: "HB Cooperativas",
  appleWebApp: {
    capable: true,
    title: "HB Cooperativas",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  formatDetection: {
    telephone: false,
  },
  robots: getPrivateAppRobotsMetadata(),
};

export const viewport: Viewport = {
  themeColor: "#15803d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${geist.variable} h-full`}
      data-dpl-id={pageRelease.deploymentId}
      data-app-build={String(pageRelease.build)}
      data-git-sha={pageRelease.gitCommitSha}
      data-cooperado-tab-keep-alive={cooperadoTabKeepAliveOn ? "1" : "0"}
      data-staff-tab-keep-alive={staffTabKeepAliveOn ? "1" : "0"}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: buildInlinePageReleaseBootstrap(pageRelease) }} />
        <script dangerouslySetInnerHTML={{ __html: buildInlineDeploymentBootScript(pageRelease) }} />
        <script dangerouslySetInnerHTML={{ __html: buildInlineRqlPerfStubScript() }} />
        <script dangerouslySetInnerHTML={{ __html: buildInlineCooperadoAppDataWarmScript() }} />
      </head>
      <body className="min-h-full antialiased">
        <AuthProvider>
          <RqlPerfDebugBootstrap />
          <ClientReleaseShieldHost />
          <PwaSilentServiceWorker />
          {children}
          <PwaProvider />
        </AuthProvider>
      </body>
    </html>
  );
}
