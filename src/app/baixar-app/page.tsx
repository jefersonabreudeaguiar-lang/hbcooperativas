"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { AppIcon } from "@/components/ui/AppIcon";
import { BaixarAppGuide, detectDevicePlatform } from "@/components/pwa/BaixarAppGuide";
import { PLATFORM_NAME } from "@/utils/constants";
import { useAuth } from "@/modules/auth/AuthProvider";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { PwaRepararAtalhoPanel } from "@/components/pwa/PwaRepararAtalhoPanel";
import { BaixarAppInstallPanel } from "@/components/pwa/BaixarAppInstallPanel";
import { prepareBrowserProfileForPwaInstall } from "@/lib/pwa/cooperadoPwaInstallPrepare";

export default function BaixarAppPage() {
  const { user } = useAuth();
  const platform = useMemo(() => detectDevicePlatform(), []);
  const loginPreparado = `/login?hb-pwa=${APP_BUILD_VERSION}`;
  const voltarHref = user ? "/dashboard" : loginPreparado;

  useEffect(() => {
    void prepareBrowserProfileForPwaInstall("install");
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white">
      <div className="max-w-lg mx-auto px-4 py-6 sm:py-10 space-y-6">
        <Link
          href={voltarHref}
          className="inline-flex items-center gap-2 text-sm font-medium text-green-800 hover:text-green-950"
        >
          <ArrowLeft size={16} />
          {user ? "Voltar ao Início" : "Voltar ao login"}
        </Link>

        <header className="flex items-start gap-4">
          <AppIcon size="xl" priority />
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-green-800 bg-green-100 px-2 py-1 rounded-full mb-2">
              <Download size={12} />
              Baixar aplicativo
            </div>
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">{PLATFORM_NAME}</h1>
            <p className="text-sm text-gray-600 mt-1">
              Instale no <strong>Android</strong> e no <strong>iPhone</strong> pela tela inicial do celular.
            </p>
          </div>
        </header>

        <BaixarAppInstallPanel />

        <BaixarAppGuide highlight={platform} />

        <PwaRepararAtalhoPanel variant="compact" />

        <p className="text-center text-sm text-gray-600">
          {user ? null : (
            <>
              Já instalou?{" "}
              <Link href={loginPreparado} className="font-semibold text-green-700 hover:text-green-900">
                Fazer login
              </Link>
              {" · "}
            </>
          )}
          <Link href="/pwa-diag.html" className="font-semibold text-green-700 hover:text-green-900">
            Diagnóstico do atalho
          </Link>
        </p>
      </div>
    </div>
  );
}
