import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/modules/auth/AuthProvider";
import { PwaProvider } from "@/components/pwa/PwaProvider";
import { PwaSilentServiceWorker } from "@/components/pwa/PwaSilentServiceWorker";
import { ClientReleaseShieldHost } from "@/components/pwa/ClientReleaseShieldHost";
import { getPrivateAppRobotsMetadata } from "@/lib/security/crawlerPolicy";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { COOPERADO_MOBILE_TAB_DOM_POLICY } from "@/lib/performance/cooperadoMobileTabDomPolicy";
import {
  buildInlineDeploymentBootScript,
  buildInlinePageReleaseBootstrap,
  buildInlinePwaStandaloneLaunchGuardScript,
  buildInlineServiceWorkerMigrationScript,
  type ClientReleaseInfo,
} from "@/lib/pwa/clientRelease";
import { buildInlineRuntimeCrashRecorderScript } from "@/lib/pwa/runtimeCrashForensics";
import { buildInlineStaleProfileGuardScript } from "@/lib/pwa/staleProfileGuard";
import { buildInlinePwaLoginHbPwaRepairAckScript } from "@/lib/pwa/pwaLoginHbPwaAckInline";
import { buildInlineChunkDplAlignGuardScript } from "@/lib/pwa/chunkDplAlignGuard";
import { buildInlineHtmlDeploymentAlignScript } from "@/lib/pwa/htmlDeploymentAlign";
import { buildInlineRescuePendingVerifyScript } from "@/lib/pwa/pwaReleaseConsistency";
import { buildInlineRqlPerfStubScript } from "@/lib/performance/rqlPerfReport";
import { buildInlineCooperadoAppDataWarmScript } from "@/lib/performance/cooperadoAppDataInlineWarm";
import {
  buildInlineCooperadoBootShellScript,
} from "@/lib/performance/cooperadoBootShell";
import { RqlPerfDebugBootstrap } from "@/components/performance/RqlPerfDebugBootstrap";
import { CooperadoBootShellDismiss } from "@/components/performance/CooperadoBootShellDismiss";
import { PwaStandaloneRepairAck } from "@/components/pwa/PwaStandaloneRepairAck";
import { buildInlineCooperadoPwaStealthReloadScript } from "@/lib/pwa/cooperadoPwaStealthReload";
import { CooperadoPwaStealthReloadHost } from "@/components/cooperado/CooperadoPwaStealthReloadHost";
import { CooperadoFleetMaintenanceHost } from "@/components/pwa/CooperadoFleetMaintenanceHost";

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
      data-cooperado-tab-dom-policy={COOPERADO_MOBILE_TAB_DOM_POLICY}
      data-staff-tab-keep-alive={staffTabKeepAliveOn ? "1" : "0"}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: buildInlineRuntimeCrashRecorderScript() }} />
        <script dangerouslySetInnerHTML={{ __html: buildInlineStaleProfileGuardScript() }} />
        <script dangerouslySetInnerHTML={{ __html: buildInlinePwaLoginHbPwaRepairAckScript() }} />
        <script dangerouslySetInnerHTML={{ __html: buildInlinePwaStandaloneLaunchGuardScript() }} />
        <script dangerouslySetInnerHTML={{ __html: buildInlineServiceWorkerMigrationScript() }} />
        <script dangerouslySetInnerHTML={{ __html: buildInlinePageReleaseBootstrap(pageRelease) }} />
        <script dangerouslySetInnerHTML={{ __html: buildInlineHtmlDeploymentAlignScript() }} />
        <script dangerouslySetInnerHTML={{ __html: buildInlineChunkDplAlignGuardScript() }} />
        <script dangerouslySetInnerHTML={{ __html: buildInlineDeploymentBootScript(pageRelease) }} />
        <script dangerouslySetInnerHTML={{ __html: buildInlineRescuePendingVerifyScript() }} />
        <script dangerouslySetInnerHTML={{ __html: buildInlineRqlPerfStubScript() }} />
        <script dangerouslySetInnerHTML={{ __html: buildInlineCooperadoAppDataWarmScript() }} />
      </head>
      <body className="min-h-full antialiased">
        <div
          id="hb-coop-boot-shell"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            background: "#f9fafb",
          }}
          aria-hidden="false"
        >
          <div style={{ height: 56, background: "#14532d", flexShrink: 0 }} />
          <div style={{ flex: 1, padding: 16, maxWidth: 512, margin: "0 auto", width: "100%" }}>
            <div style={{ height: 32, width: 192, background: "#e5e7eb", borderRadius: 8 }} />
            <div
              style={{
                marginTop: 16,
                height: 96,
                background: "#fff",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
              }}
            />
          </div>
        </div>
        <script dangerouslySetInnerHTML={{ __html: buildInlineCooperadoBootShellScript() }} />
        <script dangerouslySetInnerHTML={{ __html: buildInlineCooperadoPwaStealthReloadScript() }} />
        <AuthProvider>
          <CooperadoBootShellDismiss />
          <PwaStandaloneRepairAck />
          <CooperadoPwaStealthReloadHost />
          <RqlPerfDebugBootstrap />
          <ClientReleaseShieldHost />
          <CooperadoFleetMaintenanceHost />
          <PwaSilentServiceWorker />
          {children}
          <PwaProvider />
        </AuthProvider>
      </body>
    </html>
  );
}
